// 在交易內檢查教師、教室與時段，建立、調整或取消課堂。

const { Op, col, fn, literal, where } = require('sequelize')

const { Classroom, Course, Calendar, Teacher, Enrollment, Attend, TuitionBill, TuitionBillItem, sequelize } = require('../models')

const ATTEND_STATUS = require('../constants/attendStatus')
const COURSE_SESSION_BATCH_LIMIT = require('../constants/courseSessionBatchLimit')
const COURSE_SESSION_STATUS = require('../constants/courseSessionStatus')
const TEACHER_STATUS = require('../constants/teacherStatus')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')

const { getCandidateEnrollmentWhere, isConfirmedSessionEnrollment } = require('./courseSessionEnrollmentRules')
const { findStudentConflicts } = require('./scheduleConflictService')
const { getTeacherAccountInclude } = require('./teacherService')

const { parseTaipeiDateTime, getTaipeiDate } = require('../utils/date')

async function getAdminCourseCalendarPage({ courseId, page, pageSize }) {
  const course = await Course.findByPk(courseId, {
    attributes: ['id', 'courseNo', 'name', 'isActive']
  })

  if (!course) {
    return { ok: false, code: 'COURSE_NOT_FOUND' }
  }

  if (course.isActive === false) {
    return { ok: false, code: 'COURSE_CLOSED' }
  }

  const result = await Calendar.findAndCountAll({
    where: { CourseId: courseId },
    order: [['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    raw: true
  })

  return {
    ok: true,
    course: course.toJSON(),
    rows: result.rows.map(calendar => ({
      ...calendar,
      isLegacy:
        calendar.status === null &&
        calendar.startAt === null &&
        calendar.endAt === null &&
        calendar.TeacherId === null
    })),
    count: result.count
  }
}

async function getCreateCourseSessionFormData(courseId) {
  const course = await Course.findByPk(courseId, {
    attributes: ['id', 'courseNo', 'name', 'TeacherId', 'isActive']
  })

  if (!course) {
    return { ok: false, code: 'COURSE_NOT_FOUND' }
  }

  if (course.isActive !== true) {
    return { ok: false, code: 'COURSE_CLOSED' }
  }

  const teachers = await Teacher.findAll({
    attributes: ['id', 'name'],
    include: [getTeacherAccountInclude()],
    where: { status: TEACHER_STATUS.ACTIVE },
    order: [['id', 'ASC']],
    raw: true,
    nest: true
  })

  return {
    ok: true,
    course: course.toJSON(),
    rooms: await Classroom.findAll({ order: [['name', 'ASC']], raw: true }),
    teachers
  }
}

async function createCourseSession(courseId, sessionData = {}) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return { ok: false, code: 'INVALID_COURSE_ID' }
  }

  const prepared = prepareCourseSessionData(sessionData)
  if (!prepared.ok) return prepared

  const slot = { ...prepared.data, date: getTaipeiDate(prepared.data.startAt) }
  return saveCourseSessions(courseId, [slot], { batch: false, conflictKey: sessionData.conflictKey, editing: sessionData.editing })
}

async function createCourseSessionBatch(courseId, { dates, startTime, endTime, teacherId, content, classroomId, conflictKey } = {}) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return { ok: false, code: 'INVALID_COURSE_ID' }
  }

  if (
    !Array.isArray(dates) || dates.length === 0 || dates.length > COURSE_SESSION_BATCH_LIMIT ||
    dates.some(date => typeof date !== 'string' || !parseTaipeiDateTime(`${date}T00:00`))
  ) {
    return { ok: false, code: 'INVALID_DATES' }
  }

  if (new Set(dates).size !== dates.length) {
    return { ok: false, code: 'DUPLICATE_DATES' }
  }

  const slots = []
  for (const date of [...dates].sort()) {
    const prepared = prepareCourseSessionData({
      startAt: typeof startTime === 'string' ? `${date}T${startTime}` : null,
      endAt: typeof endTime === 'string' ? `${date}T${endTime}` : null,
      teacherId, classroomId,
      content
    })
    if (!prepared.ok) return prepared
    slots.push({ ...prepared.data, date })
  }

  return saveCourseSessions(courseId, slots, { batch: true, conflictKey })
}

async function saveCourseSessions(courseId, slots, { batch, conflictKey, editing }) {
  const driverTimezone = sequelize.options.dialectOptions?.timezone

  if (
    sequelize.options.timezone !== '+00:00' ||
    (driverTimezone !== undefined && driverTimezone !== '+00:00')
  ) {
    return { ok: false, code: 'UTC_TIMEZONE_REQUIRED' }
  }

  const { teacherId, classroomId } = slots[0]

  return sequelize.transaction(async transaction => {
    const locked = { transaction, lock: transaction.LOCK.UPDATE }
    const course = await Course.findByPk(courseId, {
      attributes: ['id', 'isActive'],
      ...locked
    })
    if (!course) return { ok: false, code: 'COURSE_NOT_FOUND' }
    if (course.isActive !== true) return { ok: false, code: 'COURSE_CLOSED' }

    const teacher = await Teacher.findByPk(teacherId, {
      attributes: ['id', 'status'],
      ...locked
    })
    if (!teacher || teacher.status !== TEACHER_STATUS.ACTIVE) {
      return { ok: false, code: 'TEACHER_UNAVAILABLE' }
    }

    if (classroomId && !await Classroom.findByPk(classroomId, locked)) return { ok: false, code: 'INVALID_ROOM' }
    let current
    if (editing) {
      current = await Calendar.findOne({ where: { id: editing.id, CourseId: courseId }, ...locked })
      if (!current || current.status !== COURSE_SESSION_STATUS.SCHEDULED || current.version !== editing.version ||
          await Attend.count({ where: { CalendarId: current.id }, transaction }) ||
          await findIssuedSessionBill(courseId, current.id, transaction)) return { ok: false, code: 'SESSION_CHANGED' }
    }
    const conflicts = await Calendar.findAll({
      attributes: ['startAt', 'endAt'],
      where: {
        status: { [Op.in]: [COURSE_SESSION_STATUS.SCHEDULED, COURSE_SESSION_STATUS.COMPLETED] },
        [Op.and]: [
          { [Op.or]: [{ CourseId: courseId }, { TeacherId: teacherId }, ...(classroomId ? [{ ClassroomId: classroomId }] : [])] },
          ...(editing ? [{ id: { [Op.ne]: editing.id } }] : []),
          {
            [Op.or]: slots.map(slot => ({
              startAt: { [Op.lt]: slot.endAt },
              endAt: { [Op.gt]: slot.startAt }
            }))
          }
        ]
      },
      raw: true,
      transaction
    })

    if (conflicts.length > 0) {
      const blockedDates = slots.filter(slot => conflicts.some(conflict =>
        conflict.startAt < slot.endAt && conflict.endAt > slot.startAt
      )).map(slot => slot.date)
      return {
        ok: false,
        code: 'TIME_CONFLICT',
        ...(batch ? { conflictDates: blockedDates.length ? blockedDates : slots.map(slot => slot.date) } : {})
      }
    }

    const warnings = await findStudentConflicts(courseId, slots, transaction)
    if (warnings && warnings.key !== conflictKey) return { ok: false, code: 'STUDENT_CONFLICT', ...warnings }

    const rows = slots.map(({ startAt, endAt, content }) => ({
      CourseId: courseId,
      TeacherId: teacherId, ClassroomId: classroomId,
      startAt,
      endAt,
      status: COURSE_SESSION_STATUS.SCHEDULED,
      content,
      date: null,
      period: null,
      isActive: false
    }))

    let id
    if (current) {
      await current.update({ ...rows[0], version: current.version + 1 }, { transaction })
      id = current.id
    } else if (batch) {
      await Calendar.bulkCreate(rows, { transaction, validate: true })
    } else {
      const calendar = await Calendar.create(rows[0], { transaction })
      id = calendar.id
    }

    const totalCount = await Calendar.count({ where: { CourseId: courseId }, transaction })
    return { ok: true, data: batch ? { createdCount: rows.length, totalCount } : { id, totalCount } }
  })
}

function findIssuedSessionBill(courseId, calendarId, transaction) {
  return TuitionBillItem.findOne({
      attributes: ['TuitionBillId'],
      where: {
        CourseId: courseId,
        kind: TUITION_BILL_ITEM_KIND.COURSE_FEE,
        [Op.and]: where(fn(
          'JSON_CONTAINS',
          col('TuitionBillItem.sourceSnapshot'),
          JSON.stringify({ calendarId }),
          literal("'$.calendars'")
        ), 1)
      },
      include: [{ model: TuitionBill, attributes: [], where: { status: TUITION_BILL_STATUS.ISSUED }, required: true }],
      raw: true,
      transaction
    })
}

async function cancelCourseSession(courseId, calendarId) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return { ok: false, code: 'INVALID_COURSE_ID' }
  }

  if (!Number.isSafeInteger(calendarId) || calendarId < 1) {
    return { ok: false, code: 'INVALID_CALENDAR_ID' }
  }

  return sequelize.transaction(async transaction => {
    const course = await Course.findByPk(courseId, {
      attributes: ['id', 'isActive'],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!course) {
      return { ok: false, code: 'COURSE_NOT_FOUND' }
    }

    if (course.isActive !== true) {
      return { ok: false, code: 'COURSE_CLOSED' }
    }

    const calendar = await Calendar.findOne({
      where: { id: calendarId, CourseId: courseId },
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!calendar) {
      return { ok: false, code: 'CALENDAR_NOT_FOUND' }
    }

    if (calendar.status === COURSE_SESSION_STATUS.CANCELLED) {
      return { ok: true, changed: false }
    }

    if (calendar.status !== COURSE_SESSION_STATUS.SCHEDULED) {
      return { ok: false, code: 'CALENDAR_NOT_CANCELLABLE' }
    }

    // 正式出帳也會鎖定課程。取得鎖之後，再查是否有帳單包含這個課堂 ID。
    const billedItem = await findIssuedSessionBill(courseId, calendarId, transaction)
    if (billedItem) {
      return { ok: false, code: 'CALENDAR_ALREADY_BILLED', billId: billedItem.TuitionBillId }
    }

    await calendar.update(
      { status: COURSE_SESSION_STATUS.CANCELLED },
      { transaction }
    )

    return { ok: true, changed: true }
  })
}

async function completeCourseSession(courseId, calendarId) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return { ok: false, code: 'INVALID_COURSE_ID' }
  }

  if (!Number.isSafeInteger(calendarId) || calendarId < 1) {
    return { ok: false, code: 'INVALID_CALENDAR_ID' }
  }

  return sequelize.transaction(async transaction => {
    const locked = {
      transaction,
      lock: transaction.LOCK.UPDATE
    }

    const course = await Course.findByPk(courseId, {
      ...locked,
      attributes: ['id', 'isActive']
    })

    if (!course) {
      return { ok: false, code: 'COURSE_NOT_FOUND' }
    }

    if (course.isActive !== true) {
      return { ok: false, code: 'COURSE_CLOSED' }
    }

    const calendar = await Calendar.findOne({
      ...locked,
      where: {
        id: calendarId,
        CourseId: courseId
      }
    })

    if (!calendar) {
      return { ok: false, code: 'CALENDAR_NOT_FOUND' }
    }

    if (calendar.status === COURSE_SESSION_STATUS.COMPLETED) {
      return { ok: true, changed: false }
    }

    if (calendar.status !== COURSE_SESSION_STATUS.SCHEDULED) {
      return { ok: false, code: 'CALENDAR_NOT_COMPLETABLE' }
    }

    if (
      !Number.isSafeInteger(calendar.TeacherId) ||
      calendar.TeacherId < 1 ||
      !(calendar.startAt instanceof Date) ||
      !Number.isFinite(calendar.startAt.getTime()) ||
      !(calendar.endAt instanceof Date) ||
      !Number.isFinite(calendar.endAt.getTime()) ||
      calendar.startAt >= calendar.endAt
    ) {
      return { ok: false, code: 'CALENDAR_REQUIRES_REVIEW' }
    }

    if (calendar.endAt.getTime() > Date.now()) {
      return { ok: false, code: 'CALENDAR_NOT_ENDED' }
    }

    const attendanceCheck = await checkCourseSessionAttendance({
      calendar,
      transaction
    })

    if (!attendanceCheck.ok) {
      return attendanceCheck
    }

    await calendar.update(
      { status: COURSE_SESSION_STATUS.COMPLETED },
      { transaction }
    )

    return { ok: true, changed: true }
  })
}

async function checkCourseSessionAttendance({ calendar, transaction }) {
  const calendarDate = getTaipeiDate(calendar.startAt)

  const locked = {
    transaction,
    lock: transaction.LOCK.UPDATE,
    raw: true
  }

  const enrollments = await Enrollment.findAll({
    ...locked,
    attributes: ['id', 'StudentId', 'startsOn', 'endsOn', 'status'],
    where: {
      CourseId: calendar.CourseId,
      ...getCandidateEnrollmentWhere(calendarDate)
    }
  })

  const enrollmentByStudentId = new Map()

  for (const enrollment of enrollments) {
    if (
      !Number.isSafeInteger(enrollment.StudentId) ||
      enrollment.StudentId < 1 ||
      !isConfirmedSessionEnrollment(enrollment) ||
      enrollmentByStudentId.has(enrollment.StudentId)
    ) {
      return {
        ok: false,
        code: 'ENROLLMENT_UNCONFIRMED'
      }
    }

    enrollmentByStudentId.set(enrollment.StudentId, enrollment)
  }

  const attends = await Attend.findAll({
    ...locked,
    attributes: ['StudentId', 'EnrollmentId', 'status'],
    where: {
      CalendarId: calendar.id
    }
  })

  const attendByStudentId = new Map()

  for (const attend of attends) {
    const enrollment = enrollmentByStudentId.get(attend.StudentId)

    if (
      !enrollment ||
      attend.EnrollmentId !== enrollment.id ||
      attendByStudentId.has(attend.StudentId)
    ) {
      return {
        ok: false,
        code: 'ATTEND_REQUIRES_REVIEW'
      }
    }

    attendByStudentId.set(attend.StudentId, attend)
  }

  const allowedStatuses = [
    ATTEND_STATUS.PRESENT,
    ATTEND_STATUS.ABSENT,
    ATTEND_STATUS.EXCUSED
  ]

  let unmarkedCount = 0

  for (const studentId of enrollmentByStudentId.keys()) {
    const attend = attendByStudentId.get(studentId)

    if (!attend || attend.status === ATTEND_STATUS.UNMARKED) {
      unmarkedCount += 1
    } else if (!allowedStatuses.includes(attend.status)) {
      return {
        ok: false,
        code: 'ATTEND_REQUIRES_REVIEW'
      }
    }
  }

  if (unmarkedCount > 0) {
    return {
      ok: false,
      code: 'ATTEND_INCOMPLETE',
      unmarkedCount
    }
  }

  return { ok: true }
}

async function getCourseCalendarData(courseId) {
  const course = await Course.findOne({
    attributes: ['id', 'courseNo', 'name'],
    where: { id: courseId, isActive: true },
    raw: true
  })

  if (!course) return null

  const sessions = await Calendar.findAll({
    attributes: ['startAt', 'endAt', 'status', 'content'],
    where: {
      CourseId: courseId,
      status: { [Op.in]: Object.values(COURSE_SESSION_STATUS) },
      startAt: { [Op.ne]: null },
      endAt: { [Op.ne]: null }
    },
    order: [['startAt', 'ASC'], ['id', 'ASC']],
    raw: true
  })

  return { course, sessions }
}

async function getLegacyCalendarEditData(courseId, calendarId) {
  const calendar = await Calendar.findOne({
    where: {
      id: calendarId,
      CourseId: courseId,
      status: null,
      startAt: null,
      endAt: null,
      TeacherId: null,
      isActive: true
    },
    include: [{
      model: Course,
      attributes: ['id', 'courseNo', 'name'],
      where: { isActive: true },
      required: true
    }]
  })

  return calendar ? calendar.toJSON() : null
}

async function updateLegacyCalendar(courseId, calendarId, { date, content }) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return { ok: false, code: 'INVALID_COURSE_ID' }
  }

  if (!Number.isSafeInteger(calendarId) || calendarId < 1) {
    return { ok: false, code: 'INVALID_CALENDAR_ID' }
  }

  if (
    typeof date !== 'string' ||
    !parseTaipeiDateTime(`${date}T00:00`)
  ) {
    return { ok: false, code: 'INVALID_LEGACY_DATE' }
  }

  if (
    typeof content !== 'string' ||
    !content.trim() ||
    content.trim().length > 40
  ) {
    return { ok: false, code: 'INVALID_CONTENT' }
  }

  return sequelize.transaction(async transaction => {
    const course = await Course.findByPk(courseId, {
      attributes: ['id', 'isActive'],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!course) {
      return { ok: false, code: 'COURSE_NOT_FOUND' }
    }

    if (course.isActive !== true) {
      return { ok: false, code: 'COURSE_CLOSED' }
    }

    const calendar = await Calendar.findOne({
      where: {
        id: calendarId,
        CourseId: courseId,
        status: null,
        startAt: null,
        endAt: null,
        TeacherId: null,
        isActive: true
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!calendar) {
      return { ok: false, code: 'LEGACY_CALENDAR_UNAVAILABLE' }
    }

    await calendar.update({
      date,
      content: content.trim()
    }, { transaction })

    return { ok: true }
  })
}

function prepareCourseSessionData({ startAt, endAt, teacherId, classroomId = null, content = '' }) {
  if (classroomId !== null && (!Number.isSafeInteger(classroomId) || classroomId < 1)) return { ok: false, code: 'INVALID_ROOM' }
  const parsedStartAt = parseTaipeiDateTime(startAt)
  const parsedEndAt = parseTaipeiDateTime(endAt)

  if (!parsedStartAt) {
    return { ok: false, code: 'INVALID_START_AT' }
  }

  if (!parsedEndAt) {
    return { ok: false, code: 'INVALID_END_AT' }
  }

  if (parsedEndAt.getTime() <= parsedStartAt.getTime()) {
    return { ok: false, code: 'INVALID_TIME_RANGE' }
  }

  if (!Number.isSafeInteger(teacherId) || teacherId < 1) {
    return { ok: false, code: 'INVALID_TEACHER_ID' }
  }

  if (typeof content !== 'string' || content.trim().length > 40) {
    return { ok: false, code: 'INVALID_CONTENT' }
  }

  return {
    ok: true,
    data: {
      startAt: parsedStartAt,
      endAt: parsedEndAt,
      teacherId, classroomId,
      content: content.trim()
    }
  }
}

module.exports = {
  createCourseSession,
  createCourseSessionBatch,
  cancelCourseSession,
  completeCourseSession,
  getAdminCourseCalendarPage,
  getCreateCourseSessionFormData,
  getCourseCalendarData,
  getLegacyCalendarEditData,
  updateLegacyCalendar
}
