const { Op } = require('sequelize')
const { Course, Calendar, Teacher, sequelize } = require('../models')
const TEACHER_STATUS = require('../constants/teacherStatus')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const { parseTaipeiDateTime } = require('../utils/date')

async function getCalendarPage({ courseId, page, pageSize }) {
  const course = await Course.findByPk(courseId, {
    attributes: ['id', 'name', 'isActive']
  })

  if (!course) {
    return { ok: false, code: 'COURSE_NOT_FOUND' }
  }

  if (course.isActive === false) {
    return { ok: false, code: 'COURSE_CLOSED' }
  }

  const [result, latestPeriod] = await Promise.all([
    Calendar.findAndCountAll({
      where: { CourseId: courseId },
      order: [['id', 'ASC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      raw: true
    }),

    Calendar.max('period', {
      where: { CourseId: courseId }
    })
  ])

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
    count: result.count,
    latestPeriod
  }
}

async function getCreateCalendarFormData(courseId) {
  const course = await Course.findByPk(courseId, {
    attributes: ['id', 'name', 'TeacherId', 'isActive']
  })

  if (!course) {
    return { ok: false, code: 'COURSE_NOT_FOUND' }
  }

  if (course.isActive !== true) {
    return { ok: false, code: 'COURSE_CLOSED' }
  }

  const teachers = await Teacher.findAll({
    attributes: ['id', 'name'],
    where: { status: TEACHER_STATUS.ACTIVE },
    order: [['id', 'ASC']],
    raw: true
  })

  return {
    ok: true,
    course: course.toJSON(),
    teachers
  }
}

async function createCalendar(courseId, calendarData) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return { ok: false, code: 'INVALID_COURSE_ID' }
  }

  const prepared = prepareCalendarData(calendarData)

  if (!prepared.ok) {
    return prepared
  }

  const driverTimezone = sequelize.options.dialectOptions?.timezone

  if (
    sequelize.options.timezone !== '+00:00' ||
    (driverTimezone !== undefined && driverTimezone !== '+00:00')
  ) {
    return { ok: false, code: 'UTC_TIMEZONE_REQUIRED' }
  }

  const data = prepared.data

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

    const teacher = await Teacher.findByPk(data.teacherId, {
      attributes: ['id', 'status'],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!teacher || teacher.status !== TEACHER_STATUS.ACTIVE) {
      return { ok: false, code: 'TEACHER_UNAVAILABLE' }
    }

    const conflict = await Calendar.findOne({
      attributes: ['id'],
      where: {
        status: {
          [Op.in]: [CALENDAR_STATUS.SCHEDULED, CALENDAR_STATUS.COMPLETED]
        },
        startAt: { [Op.lt]: data.endAt },
        endAt: { [Op.gt]: data.startAt },
        [Op.or]: [
          { CourseId: courseId },
          { TeacherId: data.teacherId }
        ]
      },
      transaction
    })

    if (conflict) {
      return { ok: false, code: 'TIME_CONFLICT' }
    }

    const calendar = await Calendar.create({
      CourseId: courseId,
      TeacherId: data.teacherId,
      startAt: data.startAt,
      endAt: data.endAt,
      status: CALENDAR_STATUS.SCHEDULED,
      content: data.content,
      date: null,
      period: null,
      isActive: false
    }, { transaction })

    const totalCount = await Calendar.count({
      where: { CourseId: courseId },
      transaction
    })

    return {
      ok: true,
      data: {
        id: calendar.id,
        totalCount
      }
    }
  })
}

async function cancelCalendar(courseId, calendarId) {
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

    if (calendar.status === CALENDAR_STATUS.CANCELLED) {
      return { ok: true, changed: false }
    }

    if (calendar.status !== CALENDAR_STATUS.SCHEDULED) {
      return { ok: false, code: 'CALENDAR_NOT_CANCELLABLE' }
    }

    await calendar.update(
      { status: CALENDAR_STATUS.CANCELLED },
      { transaction }
    )

    return { ok: true, changed: true }
  })
}

async function getCourseCalendarData(courseId) {
  const course = await Course.findOne({
    attributes: ['id', 'name'],
    where: { id: courseId, isActive: true },
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

  const [sessions, currentPeriod] = await Promise.all([
    Calendar.findAll({
      attributes: ['id', 'startAt', 'endAt', 'status', 'content'],
      where: {
        CourseId: courseId,
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
      order: [['startAt', 'ASC'], ['id', 'ASC']],
      raw: true
    }),
    Calendar.max('period', { where: legacyWhere })
  ])

  const legacyCalendars = currentPeriod == null
    ? []
    : await Calendar.findAll({
        attributes: ['id', 'date', 'content', 'isActive'],
        where: { ...legacyWhere, period: currentPeriod },
        order: [['date', 'ASC'], ['id', 'ASC']],
        raw: true
      })

  return { course, sessions, currentPeriod, legacyCalendars }
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
      attributes: ['id', 'name'],
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

async function setLegacyCalendarActive(
  courseId,
  calendarId,
  targetIsActive
) {
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
      where: {
        id: calendarId,
        CourseId: courseId,
        status: null,
        startAt: null,
        endAt: null,
        TeacherId: null
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!calendar) {
      return { ok: false, code: 'LEGACY_CALENDAR_UNAVAILABLE' }
    }

    if (calendar.isActive === targetIsActive) {
      return { ok: true, changed: false }
    }

    await calendar.update(
      { isActive: targetIsActive },
      { transaction }
    )

    return { ok: true, changed: true }
  })
}

async function closeLegacyCalendar(courseId, calendarId) {
  return setLegacyCalendarActive(courseId, calendarId, false)
}

async function openLegacyCalendar(courseId, calendarId) {
  return setLegacyCalendarActive(courseId, calendarId, true)
}

async function getLatestLegacyPeriod(courseId) {
  const period = await Calendar.max('period', {
    where: {
      CourseId: courseId,
      status: null,
      startAt: null,
      endAt: null,
      TeacherId: null
    }
  })

  return Number.isSafeInteger(period) && period > 0 ? period : null
}

function prepareCalendarData({ startAt, endAt, teacherId, content = '' }) {
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
      teacherId,
      content: content.trim()
    }
  }
}

module.exports = {
  prepareCalendarData,
  createCalendar,
  cancelCalendar,
  getCalendarPage,
  getCreateCalendarFormData,
  getCourseCalendarData,
  getLegacyCalendarEditData,
  updateLegacyCalendar,
  closeLegacyCalendar,
  openLegacyCalendar,
  getLatestLegacyPeriod
}