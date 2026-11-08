const { User, Course, Teacher, Calendar, Enrollment, Student, Attend, AuditLog, sequelize } = require('../models')
const { Op, UniqueConstraintError } = require('sequelize')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')
const ATTEND_STATUS = require('../constants/attendStatus')
const { getTaipeiDate } = require('../utils/date')

async function getAttendCourseData({ courseId, userId }) {
  const course = await Course.findOne({
    attributes: ['id', 'name'],
    where: { id: courseId, isActive: true },
    include: [{
      model: Teacher,
      attributes: [],
      where: { UserId: userId },
      required: true
    }],
    raw: true
  })

  if (!course) return null

  const legacyWhere = {
    CourseId: courseId,
    status: null,
    startAt: null,
    endAt: null,
    TeacherId: null
  }

  const maxPeriod = await Calendar.max('period', { where: legacyWhere })

  const calendars = maxPeriod == null
    ? []
    : await Calendar.findAll({
        attributes: ['id', 'date', 'content', 'isActive'],
        where: { ...legacyWhere, period: maxPeriod },
        order: [['isActive', 'DESC'], ['id', 'ASC']],
        raw: true
      })

  return { course, calendars, maxPeriod }
}

async function getAttendIndexData({ userId }) {
  const [courses, calendars] = await Promise.all([
    Course.findAll({
      attributes: ['id', 'name'],
      where: { isActive: true },
      include: [{
        model: Teacher,
        attributes: ['name'],
        where: { UserId: userId },
        required: true
      }],
      order: [['id', 'ASC']]
    }),

    Calendar.findAll({
      attributes: ['id', 'CourseId', 'startAt', 'endAt', 'status', 'content'],
      where: {
        status: {
          [Op.in]: [
            CALENDAR_STATUS.SCHEDULED,
            CALENDAR_STATUS.COMPLETED,
            CALENDAR_STATUS.CANCELLED
          ]
        },
        startAt: { [Op.ne]: null },
        endAt: { [Op.ne]: null }
      },
      include: [
        {
          model: Teacher,
          attributes: [],
          where: { UserId: userId },
          required: true
        },
        {
          model: Course,
          attributes: ['name'],
          where: { isActive: true },
          required: true
        }
      ],
      order: [['startAt', 'ASC'], ['id', 'ASC']],
      raw: true,
      nest: true
    })
  ])

  return { courses, calendars }
}

async function getAttendStudentsData({ courseId, calendarId, userId }) {
   const user = await User.findByPk(userId, {
    attributes: ['id', 'isAdmin'],
    raw: true
  })

  if (!user) return null

  const isAdmin = Number(user.isAdmin) === 1

  const calendar = await Calendar.findOne({
    attributes: ['id', 'CourseId', 'startAt', 'endAt', 'status', 'content'],
    where: {
      id: calendarId,
      CourseId: courseId,
      status: {
        [Op.in]: [
          CALENDAR_STATUS.SCHEDULED,
          CALENDAR_STATUS.COMPLETED
        ]
      }
    },
    include: [
      {
        model: Teacher,
        attributes: ['UserId'],
        ...(isAdmin ? {} : { where: { UserId: userId } }),
        required: true
      },
      {
        model: Course,
        attributes: ['id', 'name', 'isActive'],
        required: true
      }
    ],
    raw: true,
    nest: true
  })

  if (
    !calendar ||
    !(calendar.startAt instanceof Date) ||
    !Number.isFinite(calendar.startAt.getTime()) ||
    !(calendar.endAt instanceof Date) ||
    !Number.isFinite(calendar.endAt.getTime()) ||
    calendar.startAt >= calendar.endAt
  ) {
    return null
  }

  const calendarDate = getTaipeiDate(calendar.startAt)

  const enrollments = await Enrollment.findAll({
    attributes: ['StudentId', 'startsOn', 'endsOn', 'status'],
    where: {
      CourseId: courseId,
      status: {
        [Op.in]: [
          ENROLLMENT_STATUS.ACTIVE,
          ENROLLMENT_STATUS.ENDED
        ]
      },
      [Op.and]: [
        {
          [Op.or]: [
            { startsOn: null },
            { startsOn: { [Op.lte]: calendarDate } }
          ]
        },
        {
          [Op.or]: [
            { endsOn: null },
            { endsOn: { [Op.gt]: calendarDate } }
          ]
        }
      ]
    },
    raw: true
  })

  const studentIds = new Set()
  const pendingIds = new Set()

  for (const enrollment of enrollments) {
    const unknownDates =
      enrollment.startsOn == null ||
      (
        enrollment.status === ENROLLMENT_STATUS.ENDED &&
        enrollment.endsOn == null
      )

    if (unknownDates) {
      pendingIds.add(enrollment.StudentId)
    } else {
      studentIds.add(enrollment.StudentId)
    }
  }

  for (const id of studentIds) {
    pendingIds.delete(id)
  }

  const students = studentIds.size === 0
    ? []
    : await Student.findAll({
        attributes: ['id', 'name'],
        where: {
          id: { [Op.in]: [...studentIds] }
        },
        order: [['id', 'ASC']],
        raw: true
      })

  const attends = await Attend.findAll({
    attributes: ['id', 'StudentId', 'status', 'reason', 'version'],
    where: { CalendarId: calendarId },
    raw: true
  })
  
  const attendByStudentId = new Map(
    attends.map(attend => [attend.StudentId, attend])
  )

  return {
    calendar,
    course: calendar.Course,
    isAdmin,
    calendarDate,
    pendingCount: pendingIds.size,
    isAssignedTeacher: calendar.Teacher.UserId === user.id,
    students: students.map(student => ({
      ...student,
      hasAttend: attendByStudentId.has(student.id),
      attendStatus: attendByStudentId.get(student.id)?.status ?? null,
      attendReason: attendByStudentId.get(student.id)?.reason ?? '',
      attendId: attendByStudentId.get(student.id)?.id ?? null,
      attendVersion: attendByStudentId.get(student.id)?.version ?? null
    }))
  }
}

async function createAttend({
  courseId, calendarId, studentId, userId, calendarStartAt, calendarEndAt, status, reason = ''
}) {
  if (
    ![courseId, calendarId, studentId, userId].every(id => Number.isSafeInteger(id) && id > 0) ||
    typeof calendarStartAt !== 'string' || typeof calendarEndAt !== 'string'
  ) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  const allowedStatuses = [
    ATTEND_STATUS.PRESENT,
    ATTEND_STATUS.ABSENT,
    ATTEND_STATUS.EXCUSED
  ]

  if (!allowedStatuses.includes(status)) {
    return { ok: false, code: 'INVALID_STATUS' }
  }

  if (typeof reason !== 'string') {
    return { ok: false, code: 'INVALID_REASON' }
  }

  const normalizedReason = reason.trim()

  if (normalizedReason.length > 255) {
    return { ok: false, code: 'INVALID_REASON' }
  }

  if (status === ATTEND_STATUS.EXCUSED && normalizedReason === '') {
    return { ok: false, code: 'REASON_REQUIRED' }
  }

  const target = await Calendar.findOne({
    attributes: ['TeacherId'],
    where: {
      id: calendarId,
      CourseId: courseId,
      status: CALENDAR_STATUS.SCHEDULED
    },
    include: [{
      model: Teacher,
      attributes: [],
      where: { UserId: userId },
      required: true
    }],
    raw: true
  })

  if (!target) return { ok: false, code: 'CALENDAR_UNAVAILABLE' }

  try {
    return await sequelize.transaction(async transaction => {
      const locked = { transaction, lock: transaction.LOCK.UPDATE }

      const student = await Student.findByPk(studentId, {
        ...locked, attributes: ['id']
      })
      const course = await Course.findByPk(courseId, {
        ...locked, attributes: ['id', 'isActive']
      })
      const teacher = await Teacher.findOne({
        ...locked,
        attributes: ['id'],
        where: { id: target.TeacherId, UserId: userId }
      })
      const calendar = await Calendar.findOne({
        ...locked,
        where: {
          id: calendarId,
          CourseId: courseId,
          TeacherId: target.TeacherId
        }
      })

      if (
        !student || Number(course?.isActive) !== 1 || !teacher || !calendar ||
        calendar.status !== CALENDAR_STATUS.SCHEDULED ||
        !(calendar.startAt instanceof Date) || !Number.isFinite(calendar.startAt.getTime()) ||
        !(calendar.endAt instanceof Date) || !Number.isFinite(calendar.endAt.getTime()) ||
        calendar.startAt >= calendar.endAt
      ) {
        return { ok: false, code: 'CALENDAR_UNAVAILABLE' }
      }

      if (
        calendar.startAt.toISOString() !== calendarStartAt ||
        calendar.endAt.toISOString() !== calendarEndAt
      ) {
        return { ok: false, code: 'CALENDAR_CHANGED' }
      }

      const existing = await Attend.findOne({
        ...locked,
        where: { CalendarId: calendarId, StudentId: studentId }
      })

      if (existing) return { ok: true, created: false }

      const calendarDate = getTaipeiDate(calendar.startAt)
      const enrollments = await Enrollment.findAll({
        ...locked,
        attributes: ['id', 'startsOn', 'endsOn', 'status'],
        where: {
          StudentId: studentId,
          CourseId: courseId,
          status: {
            [Op.in]: [ENROLLMENT_STATUS.ACTIVE, ENROLLMENT_STATUS.ENDED]
          },
          [Op.and]: [
            {
              [Op.or]: [
                { startsOn: null },
                { startsOn: { [Op.lte]: calendarDate } }
              ]
            },
            {
              [Op.or]: [
                { endsOn: null },
                { endsOn: { [Op.gt]: calendarDate } }
              ]
            }
          ]
        },
        limit: 2
      })

      const enrollment = enrollments[0]
      if (
        enrollments.length !== 1 || enrollment.startsOn == null ||
        (
          enrollment.status === ENROLLMENT_STATUS.ENDED &&
          enrollment.endsOn == null
        )
      ) {
        return { ok: false, code: 'ENROLLMENT_UNCONFIRMED' }
      }

      await Attend.create({
        CalendarId: calendarId,
        StudentId: studentId,
        EnrollmentId: enrollment.id,
        status,
        isAttend: status === ATTEND_STATUS.PRESENT,
        reason: normalizedReason,
        recordedBy: userId,
        version: 0
      }, { transaction })

      return { ok: true, created: true }
    })
  } catch (error) {
    if (
      error instanceof UniqueConstraintError &&
      Object.hasOwn(error.fields ?? {}, 'uq_attends_calendar_student')
    ) {
      return { ok: true, created: false }
    }
    throw error
  }
}

async function updateAttend({
  courseId, calendarId, studentId, attendId, attendVersion, userId,
  calendarStartAt, calendarEndAt, status, reason = '', correctionReason
}) {
  const allowedStatuses = [
    ATTEND_STATUS.PRESENT,
    ATTEND_STATUS.ABSENT,
    ATTEND_STATUS.EXCUSED
  ]

  if (
    ![courseId, calendarId, studentId, attendId, userId]
      .every(id => Number.isSafeInteger(id) && id > 0) ||
    !Number.isSafeInteger(attendVersion) || attendVersion < 0 ||
    typeof calendarStartAt !== 'string' ||
    typeof calendarEndAt !== 'string'
  ) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  if (!allowedStatuses.includes(status)) {
    return { ok: false, code: 'INVALID_STATUS' }
  }

  if (typeof reason !== 'string' || reason.trim().length > 255) {
    return { ok: false, code: 'INVALID_REASON' }
  }

  if (
    typeof correctionReason !== 'string' ||
    !correctionReason.trim() ||
    correctionReason.trim().length > 255
  ) {
    return { ok: false, code: 'CORRECTION_REASON_REQUIRED' }
  }

  const normalizedReason = reason.trim()

  if (status === ATTEND_STATUS.EXCUSED && !normalizedReason) {
    return { ok: false, code: 'REASON_REQUIRED' }
  }

  const user = await User.findByPk(userId, {
    attributes: ['id', 'isAdmin'],
    raw: true
  })

  if (!user) return { ok: false, code: 'CALENDAR_UNAVAILABLE' }

  const isAdmin = Number(user.isAdmin) === 1

  const allowedCalendarStatuses = isAdmin
    ? [CALENDAR_STATUS.SCHEDULED, CALENDAR_STATUS.COMPLETED]
    : [CALENDAR_STATUS.SCHEDULED]

  const target = await Calendar.findOne({
    attributes: ['TeacherId'],
    where: {
      id: calendarId,
      CourseId: courseId,
      status: { [Op.in]: allowedCalendarStatuses }
    },
    include: [{
      model: Teacher,
      attributes: [],
      ...(isAdmin ? {} : { where: { UserId: userId } }),
      required: true
    }],
    raw: true
  })

  if (!target) return { ok: false, code: 'CALENDAR_UNAVAILABLE' }

  return sequelize.transaction(async transaction => {
    const locked = { transaction, lock: transaction.LOCK.UPDATE }

    const student = await Student.findByPk(studentId, {
      ...locked, attributes: ['id']
    })
    const course = await Course.findByPk(courseId, {
      ...locked, attributes: ['id', 'isActive']
    })

    const teacher = await Teacher.findOne({
      ...locked,
      attributes: ['id'],
      where: {
        id: target.TeacherId,
        ...(isAdmin ? {} : { UserId: userId })
      }
    })

    const calendar = await Calendar.findOne({
      ...locked,
      where: {
        id: calendarId,
        CourseId: courseId,
        TeacherId: target.TeacherId
      }
    })

    if (
      !student || Number(course?.isActive) !== 1 || !teacher || !calendar ||
      calendar.status !== CALENDAR_STATUS.SCHEDULED ||
      !(calendar.startAt instanceof Date) ||
      !Number.isFinite(calendar.startAt.getTime()) ||
      !(calendar.endAt instanceof Date) ||
      !Number.isFinite(calendar.endAt.getTime()) ||
      calendar.startAt >= calendar.endAt
    ) {
      return { ok: false, code: 'CALENDAR_UNAVAILABLE' }
    }

    if (
      calendar.startAt.toISOString() !== calendarStartAt ||
      calendar.endAt.toISOString() !== calendarEndAt
    ) {
      return { ok: false, code: 'CALENDAR_CHANGED' }
    }

    const attend = await Attend.findOne({
      ...locked,
      where: {
        id: attendId,
        CalendarId: calendarId,
        StudentId: studentId
      }
    })

    if (!attend) return { ok: false, code: 'ATTEND_NOT_FOUND' }

    if (
      !allowedStatuses.includes(attend.status) ||
      !Number.isSafeInteger(attend.version) ||
      attend.version < 0
    ) {
      return { ok: false, code: 'ATTEND_REQUIRES_REVIEW' }
    }

    if (attend.version !== attendVersion) {
      return { ok: false, code: 'VERSION_CONFLICT' }
    }

    const calendarDate = getTaipeiDate(calendar.startAt)
    const enrollment = await Enrollment.findOne({
      ...locked,
      attributes: ['id'],
      where: {
        id: attend.EnrollmentId,
        StudentId: studentId,
        CourseId: courseId,
        startsOn: { [Op.lte]: calendarDate },
        [Op.or]: [
          { status: ENROLLMENT_STATUS.ACTIVE, endsOn: null },
          {
            status: {
              [Op.in]: [ENROLLMENT_STATUS.ACTIVE, ENROLLMENT_STATUS.ENDED]
            },
            endsOn: { [Op.gt]: calendarDate }
          }
        ]
      }
    })

    if (!enrollment) {
      return { ok: false, code: 'ENROLLMENT_UNCONFIRMED' }
    }

    const isAttend = status === ATTEND_STATUS.PRESENT

    if (
      attend.status === status &&
      attend.reason === normalizedReason &&
      attend.isAttend === isAttend
    ) {
      return { ok: true, changed: false }
    }

    const before = {
      status: attend.status,
      reason: attend.reason,
      isAttend: attend.isAttend,
      version: attend.version
    }
    const after = {
      status,
      reason: normalizedReason,
      isAttend,
      version: attend.version + 1
    }

    await attend.update(after, { transaction })

    await AuditLog.create({
      actorId: userId,
      entityType: 'Attend',
      entityId: attend.id,
      action: 'update',
      before,
      after,
      reason: correctionReason.trim()
    }, { transaction })

    return { ok: true, changed: true }
  })
}

async function getAttendHistoryData({
  courseId, calendarId, studentId, userId
}) {
    const user = await User.findByPk(userId, {
    attributes: ['id', 'isAdmin'],
    raw: true
  })

  if (!user) return null

  const isAdmin = Number(user.isAdmin) === 1
  
  const calendar = await Calendar.findOne({
    attributes: ['id', 'startAt', 'endAt'],
    where: {
      id: calendarId,
      CourseId: courseId,
      status: {
        [Op.in]: [
          CALENDAR_STATUS.SCHEDULED,
          CALENDAR_STATUS.COMPLETED,
          CALENDAR_STATUS.CANCELLED
        ]
      }
    },
    include: [
      {
        model: Teacher,
        attributes: [],
        ...(isAdmin ? {} : { where: { UserId: userId } }),
        required: true
      },
      {
        model: Course,
        attributes: ['id', 'name'],
        required: true
      }
    ],
    raw: true,
    nest: true
  })

  if (!calendar) return null

  const attend = await Attend.findOne({
    attributes: ['id', 'status'],
    where: {
      CalendarId: calendarId,
      StudentId: studentId
    },
    include: [{
      model: Student,
      attributes: ['id', 'name'],
      required: true
    }],
    raw: true,
    nest: true
  })

  if (!attend) return null

  const logs = await AuditLog.findAll({
    attributes: ['id', 'actorId', 'before', 'after', 'reason', 'occurredAt'],
    where: {
      entityType: 'Attend',
      entityId: attend.id,
      action: 'update'
    },
    order: [['id', 'DESC']],
    limit: 50,
    raw: true
  })

  const actorIds = [...new Set(logs.map(log => log.actorId))]
  const actors = actorIds.length === 0
    ? []
    : await User.findAll({
        attributes: ['id', 'name'],
        where: { id: { [Op.in]: actorIds } },
        raw: true
      })

  return {
    calendar,
    course: calendar.Course,
    student: attend.Student,
    attend,
    logs,
    actors
  }
}

module.exports = { 
  getAttendCourseData,
  getAttendIndexData,
  getAttendStudentsData,
  createAttend,
  updateAttend,
  getAttendHistoryData
}