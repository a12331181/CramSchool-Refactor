// 依月份計算學費試算、出席及可折抵請假。

const { Op } = require('sequelize')

const { Attend, Calendar, Course, Enrollment, Student, sequelize } = require('../models')

const ATTEND_STATUS = require('../constants/attendStatus')
const { COURSE_TYPES, COURSE_PRICING_FIELDS } = require('../constants/courseOptions')
const COURSE_SESSION_STATUS = require('../constants/courseSessionStatus')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')

const { parseTaipeiDateTime, getTaipeiDate, getTaipeiMonthRange } = require('../utils/date')

function getTuitionEnrollmentStateForMonth(row, { monthStart, nextMonthStart }) {
  const isKnownDate = value =>
    typeof value === 'string' &&
    parseTaipeiDateTime(`${value}T00:00`) !== null

  const { startsOn, endsOn, status } = row
  const startKnown = isKnownDate(startsOn)
  const endKnown = isKnownDate(endsOn)

  if (startKnown && endKnown && startsOn > endsOn) return 'requires_review'
  if (startKnown && endKnown && startsOn === endsOn) return 'outside_month'

  if (
    (startKnown && startsOn >= nextMonthStart) ||
    (endKnown && endsOn <= monthStart)
  ) {
    return 'outside_month'
  }

  const validStatus =
    status === ENROLLMENT_STATUS.ACTIVE || status === ENROLLMENT_STATUS.ENDED

  if (
    !validStatus ||
    !startKnown ||
    (endsOn !== null && !endKnown) ||
    (status === ENROLLMENT_STATUS.ENDED && !endKnown)
  ) {
    return 'requires_review'
  }

  return 'in_month'
}

async function getTuitionEnrollmentsForMonth({ courseId, studentId, billingMonth } = {}, transaction) {
  if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  const range = getTaipeiMonthRange(billingMonth)
  if (!range) return { ok: false, code: 'INVALID_BILLING_MONTH' }

  const rows = await Enrollment.findAll({
    attributes: ['id', 'startsOn', 'endsOn', 'status'],
    where: { CourseId: courseId, StudentId: studentId },
    raw: true,
    transaction
  })

  if (rows.length === 0) {
    return { ok: false, code: 'ENROLLMENT_NOT_FOUND' }
  }

  const enrollments = []

  for (const row of rows) {
    const state = getTuitionEnrollmentStateForMonth(row, range)
    if (state === 'requires_review') {
      return { ok: false, code: 'ENROLLMENT_UNCONFIRMED', enrollmentId: row.id }
    }

    if (state === 'in_month') enrollments.push(row)
  }

  if (enrollments.length === 0) {
    return { ok: false, code: 'NOT_ENROLLED_IN_BILLING_MONTH' }
  }

  return {
    ok: true,
    billingMonth,
    monthStartAt: range.monthStartAt,
    nextMonthStartAt: range.nextMonthStartAt,
    enrollments
  }
}

async function getTuitionCalendars({ courseId, studentId, billingMonth } = {}, transaction) {
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
  }, transaction)

  if (!result.ok) return result

  const { monthStartAt, nextMonthStartAt, enrollments } = result

  const rows = await Calendar.findAll({
    attributes: ['id', 'startAt', 'endAt', 'status'],
    where: {
      CourseId: courseId,
      status: {
        [Op.in]: [COURSE_SESSION_STATUS.SCHEDULED, COURSE_SESSION_STATUS.COMPLETED]
      },
      startAt: {
        [Op.gte]: monthStartAt,
        [Op.lt]: nextMonthStartAt
      }
    },
    order: [['startAt', 'ASC'], ['id', 'ASC']],
    raw: true,
    transaction
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
          status: { [Op.ne]: COURSE_SESSION_STATUS.CANCELLED }
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
                  COURSE_SESSION_STATUS.SCHEDULED,
                  COURSE_SESSION_STATUS.COMPLETED,
                  COURSE_SESSION_STATUS.CANCELLED
                ]
              }
            }
          ]
        }
      ]
    },
    transaction
  })

  return {
    ok: true,
    billingMonth,
    billableCount: calendars.length,
    calendars,
    calendarReviewCount
  }
}

async function getTuitionPreview({ courseId, studentId, billingMonth } = {}, transaction) {
  const result = await getTuitionCalendars({ courseId, studentId, billingMonth }, transaction)

  if (!result.ok) return result

  const course = await Course.findByPk(courseId, {
    attributes: COURSE_PRICING_FIELDS,
    raw: true,
    transaction
  })

  return priceCourseSessions(course, studentId, result, transaction)
}

async function priceCourseSessions(course, studentId, result, transaction) {
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
  }, transaction)

  return {
    ...result,
    studentId,
    course: {
      id: course.id,
      courseNo: course.courseNo,
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

async function getTuitionAttendanceSummary({ studentId, calendars }, transaction) {
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
        raw: true,
        transaction
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
        calendar.status === COURSE_SESSION_STATUS.SCHEDULED &&
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

async function getStudentTuitionPreview({ studentId, billingMonth, courseId } = {}, transaction) {
  if (!Number.isSafeInteger(studentId) || studentId < 1 ||
      (courseId !== undefined && (!Number.isSafeInteger(courseId) || courseId < 1))) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  if (
    typeof billingMonth !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth) ||
    !parseTaipeiDateTime(`${billingMonth}-01T00:00`)
  ) {
    return { ok: false, code: 'INVALID_BILLING_MONTH' }
  }

  const student = await Student.findByPk(studentId, {
    attributes: ['id', 'studentNo', 'name'],
    raw: true,
    transaction
  })

  if (!student) {
    return { ok: false, code: 'STUDENT_NOT_FOUND' }
  }

  const rows = await Enrollment.findAll({
    attributes: ['id', 'CourseId'],
    where: { StudentId: studentId, ...(courseId === undefined ? {} : { CourseId: courseId }) },
    order: [['CourseId', 'ASC'], ['id', 'ASC']],
    raw: true,
    transaction
  })

  const courseIds = new Set()
  const reviewItems = []

  for (const row of rows) {
    if (!Number.isSafeInteger(row.CourseId) || row.CourseId < 1) {
      reviewItems.push({
        code: 'ENROLLMENT_COURSE_UNCONFIRMED',
        enrollmentId: row.id
      })
      continue
    }

    courseIds.add(row.CourseId)
  }

  // 正式出帳仍按課程 ID 依序取共享鎖，直接使用已鎖定的價格資料。
  const priceRows = courseIds.size === 0 ? [] : await Course.findAll({
    attributes: COURSE_PRICING_FIELDS,
    where: { id: { [Op.in]: [...courseIds] } },
    order: [['id', 'ASC']],
    raw: true,
    transaction,
    ...(transaction && { lock: transaction.LOCK.SHARE })
  })
  const courseById = new Map(priceRows.map(course => [course.id, course]))

  const courses = []
  let baseSubtotal = 0

  for (const courseId of courseIds) {
    const sessions = await getTuitionCalendars({ courseId, studentId, billingMonth }, transaction)
    const preview = sessions.ok
      ? await priceCourseSessions(courseById.get(courseId), studentId, sessions, transaction)
      : sessions

    if (!preview.ok) {
      if (preview.code === 'NOT_ENROLLED_IN_BILLING_MONTH') continue

      if (
        preview.code === 'INVALID_BILLING_MONTH' ||
        preview.code === 'UTC_TIMEZONE_REQUIRED'
      ) {
        return preview
      }

      reviewItems.push({
        courseId,
        code: preview.code,
        enrollmentId: preview.enrollmentId,
        calendarId: preview.calendarId
      })
      continue
    }

    baseSubtotal += preview.baseAmount

    if (!Number.isSafeInteger(baseSubtotal)) {
      return { ok: false, code: 'INVALID_AMOUNT' }
    }

    courses.push(preview)

    if (preview.billableCount === 0) {
      reviewItems.push({ courseId, code: 'NO_BILLABLE_CALENDARS' })
    }

    if (preview.calendarReviewCount == null) {
      reviewItems.push({ courseId, code: 'CALENDAR_REVIEW_UNAVAILABLE' })
    } else if (preview.calendarReviewCount > 0) {
      reviewItems.push({
        courseId,
        code: 'CALENDARS_REQUIRE_REVIEW',
        count: preview.calendarReviewCount
      })
    }

    const attendanceReviewCount = preview.attendanceSummary?.reviewCount

    if (attendanceReviewCount == null) {
      reviewItems.push({ courseId, code: 'ATTENDANCE_SUMMARY_UNAVAILABLE' })
    } else if (attendanceReviewCount > 0) {
      reviewItems.push({
        courseId,
        code: 'ATTENDANCE_REQUIRES_REVIEW',
        count: attendanceReviewCount
      })
    }
  }

  if (courses.length === 0 && reviewItems.length === 0) {
    return { ok: false, code: 'NO_COURSES_IN_BILLING_MONTH' }
  }

  return {
    ok: true,
    student,
    billingMonth,
    currency: 'TWD',
    baseSubtotal: courses.length > 0 ? baseSubtotal : null,
    courses,
    reviewItems
  }
}

module.exports = {
  getTuitionEnrollmentStateForMonth,
  getTuitionPreview,
  getStudentTuitionPreview
}
