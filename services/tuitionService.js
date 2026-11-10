const { Op, UniqueConstraintError } = require('sequelize')
const { Attend, Calendar, Course, Enrollment, Student, ExtraFee, TuitionBill, TuitionBillItem, TuitionLeaveReview, Payment, sequelize } = require('../models')
const { COURSE_TYPES } = require('../constants/courseOptions')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')
const ATTEND_STATUS = require('../constants/attendStatus')
const STUDENT_STATUS = require('../constants/studentStatus')
const { parseTaipeiDateTime, getTaipeiDate, formatTaipeiDateTime } = require('../utils/date')
const MAX_EXTRA_FEE_BILL_AMOUNT = 10000000

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

async function getStudentTuitionPreview({ studentId, billingMonth } = {}) {
  if (!Number.isSafeInteger(studentId) || studentId < 1) {
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
    attributes: ['id', 'name'],
    raw: true
  })

  if (!student) {
    return { ok: false, code: 'STUDENT_NOT_FOUND' }
  }

  const rows = await Enrollment.findAll({
    attributes: ['id', 'CourseId'],
    where: { StudentId: studentId },
    order: [['CourseId', 'ASC'], ['id', 'ASC']],
    raw: true
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

  const courses = []
  let baseSubtotal = 0

  for (const courseId of courseIds) {
    const preview = await getTuitionPreview({ courseId, studentId, billingMonth })

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

async function getStudentTuitionList({ billingMonth, page, pageSize } = {}) {
  if (
    typeof billingMonth !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth) ||
    !parseTaipeiDateTime(`${billingMonth}-01T00:00`)
  ) {
    return { ok: false, code: 'INVALID_BILLING_MONTH' }
  }

  if (
    !Number.isSafeInteger(page) || page < 1 ||
    !Number.isSafeInteger(pageSize) || pageSize < 1 ||
    !Number.isSafeInteger((page - 1) * pageSize)
  ) {
    return { ok: false, code: 'INVALID_PAGE' }
  }

  const result = await Student.findAndCountAll({
    attributes: ['id', 'name'],
    where: { status: STUDENT_STATUS.ACTIVE },
    order: [['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    raw: true
  })

  const rows = []

  for (const student of result.rows) {
    const preview = await getStudentTuitionPreview({
      studentId: student.id,
      billingMonth
    })

    if (
      !preview.ok &&
      ['INVALID_BILLING_MONTH', 'UTC_TIMEZONE_REQUIRED'].includes(preview.code)
    ) {
      return preview
    }

    rows.push({
      student,
      baseSubtotal: preview.ok ? preview.baseSubtotal : null,
      reviewCount: preview.ok ? preview.reviewItems.length : null,
      code: preview.ok ? null : preview.code
    })
  }

  return { ok: true, rows, totalCount: result.count }
}

async function createTuitionBillDraft({ studentId, billingMonth } = {}) {
  if (!Number.isSafeInteger(studentId) || studentId < 1) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  if (
    typeof billingMonth !== 'string' ||
    !parseTaipeiDateTime(`${billingMonth}-01T00:00`)
  ) {
    return { ok: false, code: 'INVALID_BILLING_MONTH' }
  }

  const where = {
    StudentId: studentId,
    billingMonth,
    status: { [Op.in]: ['draft', 'issued'] }
  }

  const findActiveBill = (options = {}) => TuitionBill.findOne({
    attributes: ['id', 'status', 'totalAmount'],
    where,
    raw: true,
    ...options
  })

  const existing = await findActiveBill()

  if (existing) {
    return { ok: true, created: false, bill: existing }
  }

  const preview = await getStudentTuitionPreview({ studentId, billingMonth })

  if (!preview.ok) return preview

  const draftReviewCodes = new Set([
    'NO_BILLABLE_CALENDARS',
    'CALENDAR_REVIEW_UNAVAILABLE',
    'CALENDARS_REQUIRE_REVIEW',
    'ATTENDANCE_SUMMARY_UNAVAILABLE',
    'ATTENDANCE_REQUIRES_REVIEW'
  ])

  const blockedItems = preview.reviewItems.filter(item =>
    !draftReviewCodes.has(item.code)
  )

  if (blockedItems.length > 0) {
    return {
      ok: false,
      code: 'DRAFT_REQUIRES_REVIEW',
      reviewItems: blockedItems
    }
  }

  if (preview.courses.length === 0) {
    return { ok: false, code: 'NO_COURSES_IN_BILLING_MONTH' }
  }

  const maxUnsignedInt = 4294967295
  const maxLineAmount = 2147483647
  const items = []
  let totalAmount = 0

  for (const entry of preview.courses) {
    const { course, quantity, unitPrice, baseAmount } = entry

    if (
      typeof course.name !== 'string' ||
      !course.name.trim() ||
      course.name.trim().length > 255
    ) {
      return { ok: false, code: 'COURSE_NAME_UNCONFIRMED', courseId: course.id }
    }

    if (
      ![quantity, unitPrice, baseAmount].every(value =>
        Number.isSafeInteger(value) && value >= 0
      ) ||
      quantity > maxUnsignedInt ||
      unitPrice > maxUnsignedInt ||
      baseAmount > maxLineAmount ||
      baseAmount !== quantity * unitPrice
    ) {
      return { ok: false, code: 'INVALID_AMOUNT', courseId: course.id }
    }

    totalAmount += baseAmount

    if (totalAmount > maxUnsignedInt) {
      return { ok: false, code: 'INVALID_AMOUNT' }
    }

    items.push({
      CourseId: course.id,
      kind: 'course_fee',
      descriptionSnapshot: course.name.trim(),
      quantity,
      unitPrice,
      amount: baseAmount,
      sourceSnapshot: {
        billingType: course.type,
        billableCount: entry.billableCount,
        calendars: entry.calendars.map(calendar => ({
          calendarId: calendar.id,
          enrollmentId: calendar.enrollmentId,
          startAt: calendar.startAt,
          endAt: calendar.endAt,
          status: calendar.status
        })),
        reviewItems: preview.reviewItems.filter(item => item.courseId === course.id)
      }
    })
  }

  try {
    return await sequelize.transaction(async transaction => {
      const locked = { transaction, lock: transaction.LOCK.UPDATE }

      const student = await Student.findByPk(studentId, {
        ...locked,
        attributes: ['id', 'name']
      })

      if (!student) {
        return { ok: false, code: 'STUDENT_NOT_FOUND' }
      }

      const current = await findActiveBill(locked)

      if (current) {
        return { ok: true, created: false, bill: current }
      }

      if (
        typeof student.name !== 'string' ||
        !student.name.trim() ||
        student.name.trim().length > 255
      ) {
        return { ok: false, code: 'STUDENT_NAME_UNCONFIRMED' }
      }

      const bill = await TuitionBill.create({
        StudentId: studentId,
        billingMonth,
        studentNameSnapshot: student.name.trim(),
        currency: 'TWD',
        status: 'draft',
        totalAmount
      }, { transaction })

      await TuitionBillItem.bulkCreate(items.map(item => ({
        ...item,
        TuitionBillId: bill.id
      })), { transaction })

      return {
        ok: true,
        created: true,
        bill: { id: bill.id, status: bill.status, totalAmount: bill.totalAmount }
      }
    })
  } catch (error) {
    if (
      !(error instanceof UniqueConstraintError) ||
      !Object.hasOwn(error.fields ?? {}, 'uq_tuition_bills_active_month')
    ) {
      throw error
    }

    const current = await findActiveBill()

    if (!current) throw error

    return { ok: true, created: false, bill: current }
  }
}

async function getTuitionBillDetails(billId) {
  if (!Number.isSafeInteger(billId) || billId < 1) {
    return { ok: false, code: 'INVALID_BILL_ID' }
  }

  const bill = await TuitionBill.findByPk(billId, {
    attributes: [
      'id', 'StudentId', 'billingMonth', 'studentNameSnapshot',
      'status', 'totalAmount', 'version'
    ],
    include: [{
      model: TuitionBillItem,
      as: 'items',
      attributes: [
        'id', 'descriptionSnapshot', 'quantity', 'unitPrice',
        'amount', 'reason', 'sourceSnapshot', 'ExtraFeeId'
      ]
    }],
    order: [[{ model: TuitionBillItem, as: 'items' }, 'id', 'ASC']]
  })

  if (!bill) return { ok: false, code: 'BILL_NOT_FOUND' }

  const savedBill = bill.toJSON()
  const addedFeeIds = new Set(savedBill.items.map(item => item.ExtraFeeId))

  const extraFees = savedBill.status === 'draft'
    ? (await ExtraFee.findAll({
        attributes: ['id', 'name', 'price'],
        order: [['name', 'ASC'], ['id', 'ASC']],
        raw: true
      })).filter(fee => isUsableBillExtraFee(fee) && !addedFeeIds.has(fee.id))
    : []

  return { ok: true, bill: savedBill, extraFees }
}

async function addTuitionBillExtraFee({ billId, extraFeeId, quantity, billVersion }) {
  if (
    ![billId, extraFeeId, quantity].every(n => Number.isSafeInteger(n) && n > 0) ||
    quantity > 999 ||
    !Number.isSafeInteger(billVersion) ||
    billVersion < 0
  ) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  return sequelize.transaction(async transaction => {
    const bill = await TuitionBill.findByPk(billId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!bill) return { ok: false, code: 'BILL_NOT_FOUND' }
    if (bill.status !== 'draft') return { ok: false, code: 'BILL_NOT_DRAFT' }
    if (bill.version !== billVersion) {
      return { ok: false, code: 'BILL_VERSION_CONFLICT' }
    }

    const existing = await TuitionBillItem.findOne({
      where: { TuitionBillId: bill.id, ExtraFeeId: extraFeeId },
      attributes: ['id'],
      transaction
    })
    if (existing) return { ok: false, code: 'EXTRA_FEE_ALREADY_ADDED' }

    const fee = await ExtraFee.findByPk(extraFeeId, {
      attributes: ['name', 'price'],
      transaction,
      lock: transaction.LOCK.SHARE
    })
    if (!isUsableBillExtraFee(fee)) {
      return { ok: false, code: 'EXTRA_FEE_UNAVAILABLE' }
    }

    const amount = fee.price * quantity
    const totalAmount = bill.totalAmount + amount

    if (
      !Number.isInteger(bill.totalAmount) || bill.totalAmount < 0 ||
      totalAmount > MAX_EXTRA_FEE_BILL_AMOUNT ||
      billVersion >= MAX_EXTRA_FEE_BILL_AMOUNT
    ) {
      return { ok: false, code: 'INVALID_AMOUNT' }
    }

    await TuitionBillItem.create({
      TuitionBillId: bill.id,
      kind: 'extra_fee',
      CourseId: null,
      ExtraFeeId: extraFeeId,
      descriptionSnapshot: fee.name.trim(),
      quantity,
      unitPrice: fee.price,
      amount,
      reason: '',
      sourceSnapshot: { extraFeeId }
    }, { transaction })

    await bill.update({ totalAmount, version: billVersion + 1 }, { transaction })
    return { ok: true }
  })
}

async function getPreviousMonthLeaveReviews({ studentId, billingMonth }) {
  const range = previousMonthWindow(billingMonth)
  if (!Number.isSafeInteger(studentId) || studentId < 1 || !range) return null

  const driverTimezone = sequelize.options.dialectOptions?.timezone
  if (
    sequelize.options.timezone !== '+00:00' ||
    (driverTimezone !== undefined && driverTimezone !== '+00:00')
  ) {
    return { reviewMonth: range.reviewMonth, rows: [], timezoneError: true }
  }

  const attends = await Attend.findAll({
    attributes: ['id', 'reason', 'version'],
    where: { StudentId: studentId, status: ATTEND_STATUS.EXCUSED },
    include: [{
      model: Calendar,
      required: true,
      attributes: ['startAt'],
      where: {
        status: { [Op.in]: [CALENDAR_STATUS.SCHEDULED, CALENDAR_STATUS.COMPLETED] },
        startAt: { [Op.gte]: range.from, [Op.lt]: range.until },
        endAt: { [Op.lte]: new Date() }
      },
      include: [{ model: Course, required: true, attributes: ['name'] }]
    }],
    order: [[Calendar, 'startAt', 'ASC'], ['id', 'ASC']],
    raw: true,
    nest: true
  })

  const latestReviewByAttendId = new Map()

  if (attends.length > 0) {
    const reviews = await TuitionLeaveReview.findAll({
      where: { AttendId: { [Op.in]: attends.map(attend => attend.id) } },
      order: [['id', 'DESC']],
      raw: true
    })

    for (const review of reviews) {
      if (!latestReviewByAttendId.has(review.AttendId)) {
        latestReviewByAttendId.set(review.AttendId, review)
      }
    }
  }

  const labels = {
    approved: '原因已核准',
    rejected: '已駁回'
  }

  return {
    reviewMonth: range.reviewMonth,
    rows: attends.map(attend => {
      const latest = latestReviewByAttendId.get(attend.id)
      const current = latest && latest.attendVersion === attend.version
        ? latest
        : null

      let decisionText = '待審核'

      if (current) {
        decisionText = labels[current.decision] ?? '待核對'
      } else if (latest) {
        decisionText = '點名已更正，待重審'
      }

      return {
        attendId: attend.id,
        attendVersion: attend.version,
        reviewId: latest?.id ?? 0,
        classAtText: formatTaipeiDateTime(attend.Calendar.startAt),
        courseName: attend.Calendar.Course.name,
        leaveReason: attend.reason,
        decisionText,
        reviewReason: current?.reason ?? ''
      }
    })
  }
}

async function recordPreviousMonthLeaveReview({
  studentId, billingMonth, attendId, attendVersion, reviewId, decision, reason, actorId
}) {
  const range = previousMonthWindow(billingMonth)
  const isId = n => Number.isSafeInteger(n) && n > 0
  const isVersion = n => Number.isSafeInteger(n) && n >= 0
  const note = typeof reason === 'string' ? reason.trim() : ''

  if (
    !range || ![studentId, attendId, actorId].every(isId) ||
    ![attendVersion, reviewId].every(isVersion) ||
    !['approved', 'rejected'].includes(decision) ||
    !note || note.length > 255
  ) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  const driverTimezone = sequelize.options.dialectOptions?.timezone
  if (
    sequelize.options.timezone !== '+00:00' ||
    (driverTimezone !== undefined && driverTimezone !== '+00:00')
  ) {
    return { ok: false, code: 'UTC_REQUIRED' }
  }

  const whereAttend = { id: attendId, StudentId: studentId }
  const target = await Attend.findOne({
    where: whereAttend,
    attributes: ['CalendarId']
  })
  if (!target) return { ok: false, code: 'LEAVE_UNAVAILABLE' }

  return sequelize.transaction(async transaction => {
    const locked = { transaction, lock: transaction.LOCK.UPDATE }

    const calendar = await Calendar.findOne({
      ...locked,
      where: {
        id: target.CalendarId,
        status: { [Op.in]: [CALENDAR_STATUS.SCHEDULED, CALENDAR_STATUS.COMPLETED] },
        startAt: { [Op.gte]: range.from, [Op.lt]: range.until },
        endAt: { [Op.lte]: new Date() }
      }
    })

    if (
      !calendar || !(calendar.startAt instanceof Date) ||
      !(calendar.endAt instanceof Date) || !(calendar.startAt < calendar.endAt)
    ) {
      return { ok: false, code: 'LEAVE_UNAVAILABLE' }
    }

    const attend = await Attend.findOne({
      ...locked,
      where: { ...whereAttend, CalendarId: calendar.id }
    })

    if (
      !attend || attend.status !== ATTEND_STATUS.EXCUSED ||
      !isVersion(attend.version) ||
      typeof attend.reason !== 'string' || !attend.reason.trim()
    ) {
      return { ok: false, code: 'LEAVE_UNAVAILABLE' }
    }

    if (attend.version !== attendVersion) {
      return { ok: false, code: 'ATTEND_CHANGED' }
    }

    const latest = await TuitionLeaveReview.findOne({
      where: { AttendId: attend.id },
      order: [['id', 'DESC']],
      transaction
    })

    if ((latest?.id ?? 0) !== reviewId) {
      return { ok: false, code: 'REVIEW_CHANGED' }
    }

    if (
      latest?.attendVersion === attendVersion &&
      latest.decision === decision && latest.reason === note
    ) {
      return { ok: true, changed: false }
    }

    await TuitionLeaveReview.create({
      AttendId: attend.id,
      attendVersion,
      decision,
      reason: note,
      reviewedBy: actorId
    }, { transaction })

    return { ok: true, changed: true }
  })
}

async function findPreviousMonthLeaveBillSource({ studentId, attendId, billingMonth } = {}) {
  const range = previousMonthWindow(billingMonth)
  const isId = value => Number.isSafeInteger(value) && value > 0

  if (!range || ![studentId, attendId].every(isId)) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  const attend = await Attend.findOne({
    attributes: ['id', 'CalendarId', 'version'],
    where: { id: attendId, StudentId: studentId, status: ATTEND_STATUS.EXCUSED },
    raw: true
  })

  if (
    !attend || !isId(attend.CalendarId) ||
    !Number.isSafeInteger(attend.version) || attend.version < 0
  ) {
    return { ok: false, code: 'LEAVE_UNAVAILABLE' }
  }

  const review = await TuitionLeaveReview.findOne({
    attributes: ['id', 'attendVersion', 'decision'],
    where: { AttendId: attend.id },
    order: [['id', 'DESC']],
    raw: true
  })

  if (review?.decision !== 'approved' || review.attendVersion !== attend.version) {
    return { ok: false, code: 'LEAVE_NOT_APPROVED' }
  }

  const bills = await TuitionBill.findAll({
    attributes: ['id', 'status'],
    where: {
      StudentId: studentId,
      billingMonth: range.reviewMonth,
      status: { [Op.in]: ['draft', 'issued'] }
    },
    limit: 2,
    raw: true
  })

  if (bills.length === 0) return { ok: false, code: 'SOURCE_BILL_NOT_FOUND' }
  if (bills.length > 1) return { ok: false, code: 'SOURCE_BILL_AMBIGUOUS' }

  const [bill] = bills
  const items = await TuitionBillItem.findAll({
    attributes: ['id', 'CourseId', 'quantity', 'unitPrice', 'sourceSnapshot'],
    where: { TuitionBillId: bill.id, kind: 'course_fee' },
    raw: true
  })

  const matches = []
  let needsReview = false

  for (const item of items) {
    const snapshot = item.sourceSnapshot
    if (snapshot?.billingType === COURSE_TYPES.MONTHLY) continue

    const ids = Array.isArray(snapshot?.calendars)
      ? snapshot.calendars.map(calendar => calendar?.calendarId)
      : null

    if (
      snapshot?.billingType !== COURSE_TYPES.PER_LESSON || !ids ||
      ids.length !== item.quantity || snapshot.billableCount !== item.quantity ||
      !ids.every(isId) || new Set(ids).size !== ids.length ||
      !Number.isSafeInteger(item.unitPrice) || item.unitPrice < 0
    ) {
      needsReview = true
      continue
    }

    if (ids.includes(attend.CalendarId)) matches.push(item)
  }

  if (matches.length > 1) return { ok: false, code: 'SOURCE_ITEM_AMBIGUOUS' }
  if (needsReview) return { ok: false, code: 'SOURCE_SNAPSHOT_UNCONFIRMED' }
  if (matches.length === 0) return { ok: false, code: 'SOURCE_ITEM_NOT_FOUND' }

  const [item] = matches
  return {
    ok: true,
    source: {
      billingMonth: range.reviewMonth,
      billId: bill.id,
      billStatus: bill.status,
      billItemId: item.id,
      courseId: item.CourseId,
      calendarId: attend.CalendarId,
      originalUnitPrice: item.unitPrice
    }
  }
}

async function getTuitionBillPaymentStatus(billId) {
  if (!Number.isSafeInteger(billId) || billId < 1) {
    return { ok: false, code: 'INVALID_BILL_ID' }
  }

  const bill = await TuitionBill.findByPk(billId, {
    attributes: ['id', 'status', 'totalAmount'],
    raw: true
  })

  if (!bill) return { ok: false, code: 'BILL_NOT_FOUND' }
  if (bill.status !== 'issued') return { ok: false, code: 'BILL_NOT_ISSUED' }

  const { totalAmount } = bill
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0) {
    return { ok: false, code: 'INVALID_BILL_AMOUNT' }
  }

  const payments = await Payment.findAll({
    attributes: ['TuitionId', 'amount'],
    where: { TuitionBillId: bill.id, isPaid: true },
    raw: true
  })

  let paidAmount = 0

  for (const payment of payments) {
    if (payment.TuitionId !== null) {
      return { ok: false, code: 'PAYMENT_LINK_CONFLICT' }
    }

    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) {
      return { ok: false, code: 'INVALID_PAYMENT_AMOUNT' }
    }

    paidAmount += payment.amount
    if (!Number.isSafeInteger(paidAmount)) {
      return { ok: false, code: 'INVALID_PAYMENT_AMOUNT' }
    }
  }

  if (paidAmount > totalAmount) {
    return { ok: false, code: 'PAYMENT_TOTAL_EXCEEDS_BILL', totalAmount, paidAmount }
  }

  return {
    ok: true,
    billId: bill.id,
    totalAmount,
    paidAmount,
    remainingAmount: totalAmount - paidAmount,
    isFullyPaid: totalAmount > 0 && paidAmount === totalAmount
  }
}

async function getPreviousMonthLeaveCreditCandidate({
  studentId, attendId, billingMonth
} = {}) {
  const result = await findPreviousMonthLeaveBillSource({
    studentId,
    attendId,
    billingMonth
  })
  if (!result.ok) return result

  const { source } = result

  if (source.billStatus !== 'issued') {
    return { ok: false, code: 'BILL_NOT_ISSUED' }
  }

  if (source.originalUnitPrice === 0) {
    return { ok: false, code: 'SOURCE_LESSON_HAS_NO_CHARGE' }
  }

  const payment = await getTuitionBillPaymentStatus(source.billId)
  if (!payment.ok) return payment

  if (!payment.isFullyPaid) {
    return {
      ok: false,
      code: 'SOURCE_BILL_NOT_FULLY_PAID',
      billId: source.billId,
      paidAmount: payment.paidAmount,
      remainingAmount: payment.remainingAmount
    }
  }

  return {
    ok: true,
    candidate: {
      studentId,
      attendId,
      targetBillingMonth: billingMonth,
      source,
      amount: source.originalUnitPrice
    }
  }
}

function previousMonthWindow(billingMonth) {
  if (
    typeof billingMonth !== 'string' ||
    billingMonth.length !== 7 ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)
  ) return null

  const until = parseTaipeiDateTime(`${billingMonth}-01T00:00`)
  if (!until) return null

  const reviewMonth = getTaipeiDate(new Date(until.getTime() - 1)).slice(0, 7)
  const from = parseTaipeiDateTime(`${reviewMonth}-01T00:00`)

  return from ? { reviewMonth, from, until } : null
}

function isUsableBillExtraFee(fee) {
  return typeof fee?.name === 'string' &&
    fee.name.trim() !== '' &&
    Number.isInteger(fee.price) &&
    fee.price > 0 &&
    fee.price <= MAX_EXTRA_FEE_BILL_AMOUNT
}

module.exports = { 
  getTuitionEnrollmentsForMonth,
  getTuitionCalendars,
  getTuitionPreview,
  getTuitionAttendanceSummary,
  getStudentTuitionPreview,
  getStudentTuitionList,
  createTuitionBillDraft,
  getTuitionBillDetails,
  addTuitionBillExtraFee,
  getPreviousMonthLeaveReviews,
  recordPreviousMonthLeaveReview,
  findPreviousMonthLeaveBillSource,
  getTuitionBillPaymentStatus,
  getPreviousMonthLeaveCreditCandidate
}