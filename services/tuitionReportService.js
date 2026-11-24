const { getStudentReference } = require('./studentService')
const { formatReferenceLabel } = require('../utils/referenceLabel')
const { Op, Transaction } = require('sequelize')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { Course, Enrollment, Student, TuitionBill, TuitionBillItem, sequelize } = require('../models')
const STUDENT_STATUS = require('../constants/studentStatus')
const STUDENT_TUITION_STATUS = require('../constants/studentTuitionStatus')
const COURSE_COLLECTION_STATUS = require('../constants/courseCollectionStatus')
const { parseTaipeiDateTime, getTaipeiMonthRange } = require('../utils/date')
const { canReceiveBillPayment } = require('./tuitionPaymentService')
const { getIssuedCoursePaymentStatuses } = require('./tuitionCoursePaymentService')
const { getIssuedTuitionBillFinancialData, getBillRefundAmounts, summarizeStudentBillGroup, combinePaymentStatuses, sumKnownAmounts } = require('./tuitionBillFinancialService')
const { getTuitionBillPaymentState, getIssuedTuitionBillPaymentStatuses } = require('./tuitionPaymentStateService')
const { getTuitionEnrollmentStateForMonth, getStudentTuitionPreview } = require('./tuitionPricingService')

async function getStudentTuitionBillsForMonth({ studentId, billingMonth } = {}) {
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

  return readTuitionSnapshot(async transaction => {
    const bills = await TuitionBill.findAll({
      attributes: ['id', 'draftNo', 'billNo', 'studentNameSnapshot', 'SupplementCourseId', 'status', 'totalAmount', 'issuedAt', 'version', 'currency'],
      where: { StudentId: studentId, billingMonth },
      order: [['id', 'DESC']],
      raw: true,
      transaction
    })

    const [financialData, student] = await Promise.all([
      getIssuedTuitionBillFinancialData(bills, transaction),
      getStudentReference(studentId, transaction)
    ])
    const courseIds = [...new Set([...financialData.values()]
      .flatMap(entry => entry.items)
      .filter(item => item.kind === TUITION_BILL_ITEM_KIND.COURSE_FEE && item.CourseId != null)
      .map(item => item.CourseId))]
    const courses = courseIds.length ? await Course.findAll({
      attributes: ['id', 'courseNo'],
      where: { id: { [Op.in]: courseIds } },
      transaction, raw: true
    }) : []
    const courseNumbers = new Map(courses.map(course => [course.id, course.courseNo]))
    const rows = bills.map(bill => {
      const financial = financialData.get(bill.id)
      return {
        ...bill,
        paymentStatus: financial?.paymentStatus ?? null,
        canReceiveGroupedPayment: bill.currency === 'TWD' && canReceiveBillPayment(bill, financial),
        refunds: financial ? getBillRefundAmounts(financial.refundLedger) : null,
        courseNames: [...new Set((financial?.items ?? [])
          .filter(item => item.kind === TUITION_BILL_ITEM_KIND.COURSE_FEE)
          .map(item => formatReferenceLabel(courseNumbers.get(item.CourseId), item.descriptionSnapshot)))]
      }
    })

    return { ok: true, student, rows, summary: summarizeStudentBillGroup(bills, financialData) }
  })
}

function groupBillsByStudent(bills) {
  const grouped = new Map()
  for (const bill of bills) {
    const group = grouped.get(bill.StudentId) ?? []
    group.push(bill)
    grouped.set(bill.StudentId, group)
  }
  return grouped
}

async function getActiveTuitionBillsForStudents(studentIds, billingMonth, transaction) {
  if (studentIds.length === 0) return []

  return TuitionBill.findAll({
    attributes: ['id', 'draftNo', 'billNo', 'StudentId', 'studentNameSnapshot', 'status', 'totalAmount'],
    where: {
      StudentId: { [Op.in]: studentIds },
      billingMonth,
      status: { [Op.in]: [TUITION_BILL_STATUS.DRAFT, TUITION_BILL_STATUS.ISSUED] }
    },
    order: [['id', 'DESC']],
    raw: true,
    transaction
  })
}

async function getStudentTuitionList({ billingMonth, statusFilter = 'all', page, pageSize } = {}) {
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

  if (typeof statusFilter !== 'string' || !Object.hasOwn(STUDENT_TUITION_STATUS, statusFilter)) {
    return { ok: false, code: 'INVALID_TUITION_STATUS' }
  }

  const allStatuses = statusFilter === 'all'
  const offset = (page - 1) * pageSize
  const studentQuery = {
    attributes: ['id', 'studentNo', 'name'],
    where: { status: STUDENT_STATUS.ACTIVE },
    order: [['id', 'ASC']],
    raw: true
  }
  const { pageRows, totalCount, financialData } = await readTuitionSnapshot(async transaction => {
    const result = allStatuses
      ? await Student.findAndCountAll({ ...studentQuery, limit: pageSize, offset, transaction })
      : { rows: await Student.findAll({ ...studentQuery, transaction }) }

    const studentIds = result.rows.map(student => student.id)
    const bills = await getActiveTuitionBillsForStudents(studentIds, billingMonth, transaction)
    const billsByStudentId = groupBillsByStudent(bills)
    const paymentStatuses = allStatuses || ['unbilled', 'draft'].includes(statusFilter)
      ? new Map()
      : await getIssuedTuitionBillPaymentStatuses(bills, transaction)

    const studentsWithBills = result.rows.map(student => ({
      student,
      bills: billsByStudentId.get(student.id) ?? []
    }))
    const matching = allStatuses ? studentsWithBills : studentsWithBills.filter(({ bills }) => {
      if (statusFilter === 'unbilled') return bills.length === 0
      if (statusFilter === 'draft') return bills.some(bill => bill.status === TUITION_BILL_STATUS.DRAFT)

      const issued = bills.filter(bill => bill.status === TUITION_BILL_STATUS.ISSUED)
      return issued.length > 0 && statusFilter === getTuitionBillPaymentState(
        combinePaymentStatuses(issued.map(bill => paymentStatuses.get(bill.id)))
      )
    })
    const pageRows = allStatuses ? matching : matching.slice(offset, offset + pageSize)
    const totalCount = allStatuses ? result.count : matching.length
    const financialData = await getIssuedTuitionBillFinancialData(
      pageRows.flatMap(row => row.bills),
      transaction
    )
    return { pageRows, totalCount, financialData }
  })
  const rows = []

  // 沒有帳單的學生，只需要試算本頁顯示的金額。
  for (const { student, bills } of pageRows) {
    if (bills.length > 0) {
      rows.push({
        student,
        bill: bills.length === 1 ? bills[0] : null,
        summary: summarizeStudentBillGroup(bills, financialData)
      })
      continue
    }

    const preview = await getStudentTuitionPreview({
      studentId: student.id,
      billingMonth
    })

    rows.push({
      student,
      baseSubtotal: preview.ok ? preview.baseSubtotal : null,
      reviewCount: preview.ok ? preview.reviewItems.length : null,
      code: preview.ok ? null : preview.code
    })
  }

  return { ok: true, rows, totalCount }
}

function sumCourseFeeAmounts(amounts) {
  if (amounts.length === 0 || amounts.some(amount => !Number.isSafeInteger(amount) || amount < 0)) {
    return null
  }

  const total = amounts.reduce((sum, amount) => sum + amount, 0)
  return Number.isSafeInteger(total) ? total : null
}

async function getStudentTuitionHistory({ courseId, studentId } = {}) {
  const byCourse = courseId !== undefined
  if (
    !Number.isSafeInteger(studentId) || studentId < 1 ||
    (byCourse && (!Number.isSafeInteger(courseId) || courseId < 1))
  ) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  return readTuitionSnapshot(async transaction => {
    const [course, student] = await Promise.all([
      byCourse ? Course.findByPk(courseId, { attributes: ['id', 'courseNo', 'name'], raw: true, transaction }) : null,
      getStudentReference(studentId, transaction)
    ])
    if (byCourse && !course) return { ok: false, code: 'COURSE_NOT_FOUND' }
    if (!student) return { ok: false, code: 'STUDENT_NOT_FOUND' }

    const savedBills = await TuitionBill.findAll({
      attributes: ['id', 'draftNo', 'billNo', 'billingMonth', 'status', 'issuedAt', 'totalAmount'],
      where: {
        StudentId: studentId,
        status: {
          [Op.in]: [TUITION_BILL_STATUS.DRAFT, TUITION_BILL_STATUS.ISSUED, TUITION_BILL_STATUS.VOID]
        }
      },
      include: byCourse ? [{
        model: TuitionBillItem,
        as: 'items',
        attributes: ['id', 'amount'],
        where: { CourseId: courseId, kind: TUITION_BILL_ITEM_KIND.COURSE_FEE },
        required: true
      }] : [],
      order: [['billingMonth', 'DESC'], ['id', 'DESC']],
      transaction
    })

    const bills = savedBills.map(bill => bill.toJSON())
    const coursePayments = byCourse ? await getIssuedCoursePaymentStatuses(bills, transaction) : null
    const billFinancialData = byCourse ? null : await getIssuedTuitionBillFinancialData(bills, transaction)
    const rows = bills.map(({ items, ...bill }) => {
      const isIssued = bill.status === TUITION_BILL_STATUS.ISSUED
      const billData = billFinancialData?.get(bill.id)
      const paymentStatus = byCourse ? coursePayments.get(bill.id)?.get(courseId) : billData?.paymentStatus
      const amount = bill.status === TUITION_BILL_STATUS.VOID
        ? null
        : !byCourse ? bill.totalAmount
          : isIssued ? paymentStatus?.totalAmount ?? null : sumCourseFeeAmounts(items.map(item => item.amount))

      const refunds = !isIssued ? null : byCourse
        ? {
            ok: paymentStatus?.ok === true,
            refundedAmount: paymentStatus?.refundedAmount,
            netReceivedAmount: paymentStatus?.netReceivedAmount
          }
        : getBillRefundAmounts(billData?.refundLedger)
      return { bill, amount, paymentStatus: paymentStatus ?? null, refunds }
    })

    return { ok: true, course, student, rows }
  })
}

function getCourseEnrollments(courseIds, transaction) {
  return Enrollment.findAll({
    attributes: ['CourseId', 'StudentId', 'startsOn', 'endsOn', 'status'],
    where: { CourseId: { [Op.in]: courseIds } },
    raw: true,
    transaction
  })
}

function getCourseFeeItemsForMonth({ courseIds, billingMonth }, transaction) {
  return TuitionBillItem.findAll({
    attributes: ['CourseId', 'TuitionBillId', 'amount'],
    where: {
      kind: TUITION_BILL_ITEM_KIND.COURSE_FEE,
      ...(courseIds === undefined ? {} : { CourseId: { [Op.in]: courseIds } })
    },
    include: [{
      model: TuitionBill,
      attributes: ['id', 'StudentId', 'status', 'totalAmount'],
      where: { billingMonth, status: { [Op.in]: [TUITION_BILL_STATUS.DRAFT, TUITION_BILL_STATUS.ISSUED] } },
      required: true
    }],
    raw: true,
    nest: true,
    transaction
  })
}

function readTuitionSnapshot(read) {
  return sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    readOnly: true
  }, read)
}

async function summarizeCoursePage(courses, billingMonth, range, transaction) {
  if (!courses.length) return []
  const courseIds = courses.map(course => course.id)
  const courseFeeItems = await getCourseFeeItemsForMonth({ courseIds, billingMonth }, transaction)
  const enrollments = await getCourseEnrollments(courseIds, transaction)
  const summaries = new Map(courses.map(({ id }) => [id, {
    studentIds: new Set(),
    issuedStudentIds: new Set(),
    issuedBillIds: new Set()
  }]))

  for (const enrollment of enrollments) {
    const { StudentId: studentId, CourseId: courseId } = enrollment
    if (!Number.isSafeInteger(studentId) || studentId < 1) continue
    if (getTuitionEnrollmentStateForMonth(enrollment, range) === 'outside_month') continue
    summaries.get(courseId).studentIds.add(studentId)
  }

  const issuedBills = new Map()
  for (const { CourseId: courseId, TuitionBill: bill } of courseFeeItems) {
    const summary = summaries.get(courseId)
    if (!summary) continue
    summary.studentIds.add(bill.StudentId)
    if (bill.status !== TUITION_BILL_STATUS.ISSUED) continue

    summary.issuedStudentIds.add(bill.StudentId)
    summary.issuedBillIds.add(bill.id)
    issuedBills.set(bill.id, bill)
  }

  const paymentStatuses = await getIssuedCoursePaymentStatuses([...issuedBills.values()], transaction)
  const rows = courses.map(course => {
    const { studentIds, issuedStudentIds, issuedBillIds } = summaries.get(course.id)
    const statuses = [...issuedBillIds].map(id => paymentStatuses.get(id)?.get(course.id))
    const totalOf = field => statuses.length === 0 ? 0 : sumCourseFeeAmounts(statuses.map(status => status?.[field]))
    const receivableAmount = totalOf('totalAmount')
    const receivedAmount = totalOf('paidAmount')
    const refundedAmount = totalOf('refundedAmount')
    const netReceivedAmount = totalOf('netReceivedAmount')
    const remainingAmount = totalOf('remainingAmount')

    let collectionStatus = COURSE_COLLECTION_STATUS.PAID
    if (studentIds.size === 0) {
      collectionStatus = COURSE_COLLECTION_STATUS.EMPTY
    } else if (issuedStudentIds.size < studentIds.size) {
      collectionStatus = COURSE_COLLECTION_STATUS.UNISSUED
    } else if (
      statuses.some(status => !status?.ok) ||
      [receivableAmount, receivedAmount, refundedAmount, netReceivedAmount, remainingAmount].some(amount => amount === null)
    ) {
      collectionStatus = COURSE_COLLECTION_STATUS.REVIEW
    } else if (receivableAmount === 0) {
      collectionStatus = COURSE_COLLECTION_STATUS.NO_PAYMENT
    } else if (remainingAmount > 0) {
      collectionStatus = COURSE_COLLECTION_STATUS.UNPAID
    } else if (refundedAmount > 0) {
      collectionStatus = netReceivedAmount === 0
        ? COURSE_COLLECTION_STATUS.REFUNDED
        : COURSE_COLLECTION_STATUS.PARTIALLY_REFUNDED
    }

    return { ...course, receivableAmount, receivedAmount, refundedAmount, netReceivedAmount, remainingAmount, collectionStatus }
  })

  return rows
}

async function getCoursePaymentOverview({ billingMonth, page = 1, pageSize = 12, filter = 'all', includeTotals = false } = {}) {
  const range = getTaipeiMonthRange(billingMonth)
  if (!range) return { ok: false, code: 'INVALID_BILLING_MONTH' }
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 ||
    !['all', 'unpaid', 'review'].includes(filter)) return { ok: false, code: 'INVALID_INPUT' }
  const offset = (page - 1) * pageSize
  if (!Number.isSafeInteger(offset)) return { ok: false, code: 'INVALID_PAGE' }
  return readTuitionSnapshot(async transaction => {
    // 已關課但當月有草稿或正式帳單的課程也要出現在列表。
    const billed = sequelize.literal('EXISTS (SELECT 1 FROM TuitionBillItems i JOIN TuitionBills b ON b.id = i.TuitionBillId ' +
      'WHERE i.CourseId = ' + sequelize.getQueryInterface().queryGenerator.quoteIdentifier(Course.name) + '.id AND i.kind = ' + sequelize.escape(TUITION_BILL_ITEM_KIND.COURSE_FEE) +
      ' AND b.billingMonth = ' + sequelize.escape(billingMonth) + " AND b.status IN ('draft','issued'))")
    const query = { attributes: ['id', 'courseNo', 'name', 'isActive'], where: { [Op.or]: [{ isActive: true }, billed] },
      order: [['id', 'ASC']], raw: true, transaction }
    if (filter === 'all' && !includeTotals) {
      const rows = await Course.findAll({
        ...query, attributes: [...query.attributes, [sequelize.literal('COUNT(*) OVER ()'), 'matchingCount']],
        limit: pageSize, offset
      })
      const totalCount = rows.length ? Number(rows[0].matchingCount) :
        (offset ? await Course.count({ where: query.where, transaction }) : 0)
      const pageCourses = rows.map(({ matchingCount, ...course }) => course)
      return { ok: true, totalCount, courses: await summarizeCoursePage(pageCourses, billingMonth, range, transaction) }
    }

    // 過濾與整月合計需要完整的帳務判定。按主鍵分段，只保留當頁資料。
    let cursor = 0
    let totalCount = 0
    const courses = []
    const totals = { receivableAmount: 0, receivedAmount: 0, refundedAmount: 0, netReceivedAmount: 0, remainingAmount: 0 }
    for (;;) {
      const group = await Course.findAll({ ...query, where: { ...query.where, id: { [Op.gt]: cursor } }, limit: 60 })
      if (!group.length) break
      for (const row of await summarizeCoursePage(group, billingMonth, range, transaction)) {
        if (includeTotals) for (const key of Object.keys(totals)) {
          totals[key] = totals[key] === null || row[key] === null ? null : totals[key] + row[key]
        }
        if (filter === 'unpaid' && !(row.remainingAmount > 0)) continue
        if (filter === 'review' && row.collectionStatus !== COURSE_COLLECTION_STATUS.REVIEW &&
            Object.keys(totals).every(key => row[key] !== null)) continue
        if (totalCount >= offset && courses.length < pageSize) courses.push(row)
        totalCount++
      }
      cursor = group[group.length - 1].id
      if (group.length < 60) break
    }
    return { ok: true, courses, totalCount, totals: includeTotals ? totals : null }
  })
}

async function getCourseMonthlyTuitionList({ courseId, billingMonth, page, pageSize } = {}) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return { ok: false, code: 'INVALID_COURSE_ID' }
  }

  const range = getTaipeiMonthRange(billingMonth)
  if (!range) return { ok: false, code: 'INVALID_BILLING_MONTH' }

  if (
    !Number.isSafeInteger(page) || page < 1 ||
    !Number.isSafeInteger(pageSize) || pageSize < 1 ||
    !Number.isSafeInteger((page - 1) * pageSize)
  ) {
    return { ok: false, code: 'INVALID_PAGE' }
  }

  return readTuitionSnapshot(async transaction => {
    const course = await Course.findByPk(courseId, { attributes: ['id', 'courseNo', 'name'], raw: true, transaction })
    if (!course) return { ok: false, code: 'COURSE_NOT_FOUND' }

    const [enrollments, courseFeeItems] = await Promise.all([
      getCourseEnrollments([courseId], transaction),
      getCourseFeeItemsForMonth({ courseIds: [courseId], billingMonth }, transaction)
    ])

    const studentIds = new Set()
    const enrollmentReviewIds = new Set()
    for (const enrollment of enrollments) {
      const { StudentId: studentId } = enrollment
      if (!Number.isSafeInteger(studentId) || studentId < 1) continue

      const state = getTuitionEnrollmentStateForMonth(enrollment, range)
      if (state === 'outside_month') continue

      studentIds.add(studentId)
      if (state === 'requires_review') enrollmentReviewIds.add(studentId)
    }

    const courseFeesByBillId = new Map()
    for (const item of courseFeeItems) {
      studentIds.add(item.TuitionBill.StudentId)
      const amounts = courseFeesByBillId.get(item.TuitionBillId) ?? []
      amounts.push(item.amount)
      courseFeesByBillId.set(item.TuitionBillId, amounts)
    }

    const offset = (page - 1) * pageSize
    const pageStudentIds = [...studentIds].sort((a, b) => a - b).slice(offset, offset + pageSize)
    if (pageStudentIds.length === 0) {
      return { ok: true, course, rows: [], totalCount: studentIds.size }
    }

    const [students, bills] = await Promise.all([
      Student.findAll({
        attributes: ['id', 'studentNo', 'name'],
        where: { id: { [Op.in]: pageStudentIds } },
        raw: true,
        transaction
      }),
      getActiveTuitionBillsForStudents(pageStudentIds, billingMonth, transaction)
    ])
    const studentsById = new Map(students.map(student => [student.id, student]))
    const billsByStudentId = groupBillsByStudent(bills)
    const coursePayments = await getIssuedCoursePaymentStatuses(
      bills.filter(bill => courseFeesByBillId.has(bill.id)),
      transaction
    )

    const rows = pageStudentIds.map(studentId => {
      const student = studentsById.get(studentId) ?? null
      const studentBills = billsByStudentId.get(studentId) ?? []
      const courseBills = studentBills.filter(bill => courseFeesByBillId.has(bill.id))
      const issued = courseBills.filter(bill => bill.status === TUITION_BILL_STATUS.ISSUED)
      const drafts = courseBills.filter(bill => bill.status === TUITION_BILL_STATUS.DRAFT)
      const statuses = issued.map(bill => coursePayments.get(bill.id)?.get(courseId))
      const combined = combinePaymentStatuses(statuses)
      const coursePayment = combined?.ok && statuses.length > 1
        ? {
            ...combined,
            refundedAmount: sumKnownAmounts(statuses.map(status => status.refundedAmount)),
            netReceivedAmount: sumKnownAmounts(statuses.map(status => status.netReceivedAmount))
          }
        : combined
      if (coursePayment?.ok && (coursePayment.refundedAmount === null || coursePayment.netReceivedAmount === null)) {
        coursePayment.ok = false
      }

      return {
        studentId,
        student,
        bill: issued[0] ?? drafts[0] ?? studentBills[0] ?? null,
        draftCount: drafts.length,
        enrollmentNeedsReview: enrollmentReviewIds.has(studentId),
        hasCourseFee: courseBills.length > 0,
        courseAmount: issued.length > 0
          ? coursePayment?.totalAmount ?? null
          : sumCourseFeeAmounts(drafts.flatMap(bill => courseFeesByBillId.get(bill.id))),
        coursePayment
      }
    })

    return { ok: true, course, rows, totalCount: studentIds.size }
  })
}

module.exports = {
  getStudentTuitionBillsForMonth,
  getStudentTuitionList,
  getStudentTuitionHistory,
  getCoursePaymentOverview,
  getCourseMonthlyTuitionList,
  readTuitionSnapshot
}
