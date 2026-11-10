const { Op } = require('sequelize')
const { Calendar, Course, Enrollment, Attend, sequelize } = require('../models')
const { COURSE_TYPES } = require('../constants/courseOptions')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')
const ATTEND_STATUS = require('../constants/attendStatus')
const { parseTaipeiDateTime, getTaipeiDate } = require('../utils/date')

async function getTuitionEnrollmentsForMonth({ courseId, studentId, billingMonth } = {}) {
  if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  if (typeof billingMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
    return { ok: false, code: 'INVALID_BILLING_MONTH' }
  }
  const [year, month] = billingMonth.split('-').map(Number)
  const monthStart = `${billingMonth}-01`
  const nextMonthStart = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const monthStartAt = parseTaipeiDateTime(`${monthStart}T00:00`)
  const nextMonthStartAt = parseTaipeiDateTime(`${nextMonthStart}T00:00`)

  if (!monthStartAt || !nextMonthStartAt) {
    return { ok: false, code: 'INVALID_BILLING_MONTH' }
  }

  const isKnownDate = value =>
    typeof value === 'string' &&
    parseTaipeiDateTime(`${value}T00:00`) !== null

  if (!isKnownDate(monthStart) || !isKnownDate(nextMonthStart)) {
    return { ok: false, code: 'INVALID_BILLING_MONTH' }
  }

  const rows = await Enrollment.findAll({
    attributes: ['id', 'startsOn', 'endsOn', 'status'],
    where: { CourseId: courseId, StudentId: studentId },
    raw: true
  })

  if (rows.length === 0) {
    return { ok: false, code: 'ENROLLMENT_NOT_FOUND' }
  }

  const enrollments = []

  for (const row of rows) {
    const { startsOn, endsOn, status } = row
    const startKnown = isKnownDate(startsOn)
    const endKnown = isKnownDate(endsOn)

    if (startKnown && endKnown && startsOn > endsOn) {
      return { ok: false, code: 'ENROLLMENT_UNCONFIRMED', enrollmentId: row.id }
    }

    if (startKnown && endKnown && startsOn === endsOn) continue

    if (
      (startKnown && startsOn >= nextMonthStart) ||
      (endKnown && endsOn <= monthStart)
    ) {
      continue
    }

    const validStatus =
      status === ENROLLMENT_STATUS.ACTIVE || status === ENROLLMENT_STATUS.ENDED

    if (
      !validStatus ||
      !startKnown ||
      (endsOn !== null && !endKnown) ||
      (status === ENROLLMENT_STATUS.ENDED && !endKnown)
    ) {
      return { ok: false, code: 'ENROLLMENT_UNCONFIRMED', enrollmentId: row.id }
    }

    enrollments.push(row)
  }

  if (enrollments.length === 0) {
    return { ok: false, code: 'NOT_ENROLLED_IN_BILLING_MONTH' }
  }

  return {
    ok: true,
    billingMonth,
    monthStartAt,
    nextMonthStartAt,
    enrollments
  }
}

async function getTuitionCalendars({ courseId, studentId, billingMonth } = {}) {
  const driverTimezone = sequelize.options.dialectOptions?.timezone

  if (
    sequelize.options.timezone !== '+00:00' ||
    (driverTimezone !== undefined && driverTimezone !== '+00:00')
  ) {
    return { ok: false, code: 'UTC_TIMEZONE_REQUIRED' }
  }

  const result = await getTuitionEnrollmentsForMonth({
    courseId,
    studentId,
    billingMonth
  })

  if (!result.ok) return result

  const { monthStartAt, nextMonthStartAt, enrollments } = result

  const rows = await Calendar.findAll({
    attributes: ['id', 'startAt', 'endAt', 'status'],
    where: {
      CourseId: courseId,
      status: {
        [Op.in]: [CALENDAR_STATUS.SCHEDULED, CALENDAR_STATUS.COMPLETED]
      },
      startAt: {
        [Op.gte]: monthStartAt,
        [Op.lt]: nextMonthStartAt
      }
    },
    order: [['startAt', 'ASC'], ['id', 'ASC']],
    raw: true
  })

  const calendars = []

  for (const calendar of rows) {
    if (
      !(calendar.startAt instanceof Date) ||
      !Number.isFinite(calendar.startAt.getTime()) ||
      !(calendar.endAt instanceof Date) ||
      !Number.isFinite(calendar.endAt.getTime()) ||
      calendar.endAt <= calendar.startAt
    ) {
      return {
        ok: false,
        code: 'CALENDAR_REQUIRES_REVIEW',
        calendarId: calendar.id
      }
    }

    const calendarDate = getTaipeiDate(calendar.startAt)
    const matched = enrollments.filter(({ startsOn, endsOn }) =>
      startsOn <= calendarDate &&
      (endsOn === null || endsOn > calendarDate)
    )

    if (matched.length === 0) continue

    if (matched.length > 1) {
      return {
        ok: false,
        code: 'ENROLLMENT_UNCONFIRMED',
        calendarId: calendar.id
      }
    }

    calendars.push({
      ...calendar,
      calendarDate,
      enrollmentId: matched[0].id
    })
  }

  const calendarReviewCount = await Calendar.count({
    where: {
      CourseId: courseId,
      [Op.or]: [
        { startAt: null, status: null },
        {
          startAt: null,
          status: { [Op.ne]: CALENDAR_STATUS.CANCELLED }
        },
        {
          startAt: {
            [Op.gte]: monthStartAt,
            [Op.lt]: nextMonthStartAt
          },
          [Op.or]: [
            { status: null },
            {
              status: {
                [Op.notIn]: [
                  CALENDAR_STATUS.SCHEDULED,
                  CALENDAR_STATUS.COMPLETED,
                  CALENDAR_STATUS.CANCELLED
                ]
              }
            }
          ]
        }
      ]
    }
  })

  return {
    ok: true,
    billingMonth,
    billableCount: calendars.length,
    calendars,
    calendarReviewCount
  }
}

async function getTuitionPreview({ courseId, studentId, billingMonth } = {}) {
  const result = await getTuitionCalendars({ courseId, studentId, billingMonth })

  if (!result.ok) return result

  const course = await Course.findByPk(courseId, {
    attributes: ['id', 'name', 'type', 'price'],
    raw: true
  })

  if (!course) {
    return { ok: false, code: 'COURSE_NOT_FOUND' }
  }

  const isMonthly = course.type === COURSE_TYPES.MONTHLY
  const isPerLesson = course.type === COURSE_TYPES.PER_LESSON

  if (typeof course.type !== 'string' || (!isMonthly && !isPerLesson)) {
    return { ok: false, code: 'INVALID_BILLING_TYPE' }
  }

  if (!Number.isSafeInteger(course.price) || course.price < 0) {
    return { ok: false, code: 'INVALID_PRICE' }
  }

  const quantity = isMonthly ? 1 : result.billableCount
  const unitPrice = course.price
  const baseAmount = quantity * unitPrice

  if (!Number.isSafeInteger(baseAmount)) {
    return { ok: false, code: 'INVALID_AMOUNT' }
  }

  const attendanceSummary = await getTuitionAttendanceSummary({
    studentId,
    calendars: result.calendars
  })

  return {
    ...result,
    studentId,
    course: {
      id: course.id,
      name: course.name,
      type: course.type
    },
    currency: 'TWD',
    quantity,
    unitPrice,
    baseAmount,
    attendanceSummary
  }
}

async function getTuitionAttendanceSummary({ studentId, calendars }) {
  const counts = {
    [ATTEND_STATUS.PRESENT]: 0,
    [ATTEND_STATUS.ABSENT]: 0,
    [ATTEND_STATUS.EXCUSED]: 0,
    [ATTEND_STATUS.UNMARKED]: 0,
    not_due: 0,
    requires_review: 0
  }

  const attends = calendars.length === 0
    ? []
    : await Attend.findAll({
        attributes: ['CalendarId', 'EnrollmentId', 'status', 'reason'],
        where: {
          StudentId: studentId,
          CalendarId: { [Op.in]: calendars.map(calendar => calendar.id) }
        },
        raw: true
      })

  const attendByCalendarId = new Map()

  for (const attend of attends) {
    attendByCalendarId.set(
      attend.CalendarId,
      attendByCalendarId.has(attend.CalendarId) ? null : attend
    )
  }

  const validStatuses = [
    ATTEND_STATUS.PRESENT,
    ATTEND_STATUS.ABSENT,
    ATTEND_STATUS.EXCUSED,
    ATTEND_STATUS.UNMARKED
  ]
  const now = Date.now()

  const items = calendars.map(calendar => {
    const attend = attendByCalendarId.get(calendar.id)
    let status
    let reason = ''

    if (
      attendByCalendarId.has(calendar.id) &&
      (!attend ||
        attend.EnrollmentId !== calendar.enrollmentId ||
        !validStatuses.includes(attend.status))
    ) {
      status = 'requires_review'
    } else if (!attend || attend.status === ATTEND_STATUS.UNMARKED) {
      status =
        calendar.status === CALENDAR_STATUS.SCHEDULED &&
        calendar.endAt.getTime() > now
          ? 'not_due'
          : ATTEND_STATUS.UNMARKED
    } else {
      status = attend.status
      reason = attend.reason ?? ''
    }

    counts[status] += 1

    return {
      calendarId: calendar.id,
      calendarDate: calendar.calendarDate,
      status,
      reason
    }
  })

  const reviewCount =
    counts[ATTEND_STATUS.ABSENT] +
    counts[ATTEND_STATUS.EXCUSED] +
    counts[ATTEND_STATUS.UNMARKED] +
    counts.requires_review

  return { counts, reviewCount, items }
}

module.exports = { 
  getTuitionEnrollmentsForMonth,
  getTuitionCalendars,
  getTuitionPreview,
  getTuitionAttendanceSummary
}