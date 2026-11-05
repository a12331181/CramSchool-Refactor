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
    rows: result.rows,
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

    return { ok: true, data: { id: calendar.id } }
  })
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
  getCalendarPage,
  getCreateCalendarFormData,
  getLegacyCalendarEditData,
  updateLegacyCalendar
}