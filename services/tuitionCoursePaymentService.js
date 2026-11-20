const { Op } = require('sequelize')
const { TuitionBillItem, TuitionBillRefund } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const COURSE_PAYMENT_REVIEW = require('../constants/coursePaymentReview')
const { buildPayableItems, getAllocationStates } = require('./tuitionPaymentAllocationService')
const { getIssuedTuitionBillPaymentData, getLastPaidOn } = require('./tuitionPaymentStateService')

function review(code, totalAmount = null) {
  return { ok: false, code, totalAmount, paidAmount: null, remainingAmount: null, lastPaidOn: null }
}

function summarizeCoursePayments({ items, payments, paymentStatus, allocation, hasRefund }) {
  const courseItems = new Map()
  for (const item of items) {
    if (item.kind !== TUITION_BILL_ITEM_KIND.COURSE_FEE || !Number.isSafeInteger(item.CourseId) || item.CourseId < 1) continue
    const group = courseItems.get(item.CourseId) ?? []
    group.push(item)
    courseItems.set(item.CourseId, group)
  }

  // This is the same net amount split used by checkout, including order and rounding.
  const payableItems = allocation?.itemized
    ? allocation.items
    : paymentStatus?.ok ? buildPayableItems(items, paymentStatus.totalAmount) : null
  const payableById = new Map((payableItems ?? []).map(item => [item.itemId, item]))
  const paymentsById = new Map(payments.map(payment => [payment.id, payment]))
  const result = new Map()

  for (const [courseId, lines] of courseItems) {
    const totalAmount = payableItems
      ? lines.reduce((sum, line) => sum + (payableById.get(line.id)?.amount ?? 0), 0)
      : null

    let state
    if (!allocation?.ok || totalAmount === null) {
      state = review(COURSE_PAYMENT_REVIEW.ALLOCATION_INVALID, totalAmount)
    } else if (totalAmount === 0) {
      state = { ok: true, totalAmount, paidAmount: 0, remainingAmount: 0, isFullyPaid: false, lastPaidOn: null }
    } else if (hasRefund) {
      // A refund is linked to the bill, not its lines. Do not assign it to a course.
      state = review(COURSE_PAYMENT_REVIEW.REFUND_UNASSIGNED, totalAmount)
    } else if (allocation.itemized) {
      const paidItems = lines.map(line => payableById.get(line.id)).filter(item => item?.paymentId != null)
      const paidAmount = paidItems.reduce((sum, item) => sum + item.amount, 0)
      const paymentIds = new Set(paidItems.map(item => item.paymentId))
      state = {
        ok: true,
        totalAmount,
        paidAmount,
        remainingAmount: totalAmount - paidAmount,
        isFullyPaid: paidAmount === totalAmount,
        lastPaidOn: getLastPaidOn([...paymentIds].map(id => paymentsById.get(id)))
      }
    } else if (allocation.reason === 'LEGACY_UNALLOCATED_PAYMENT' &&
      (paymentStatus.isFullyPaid || totalAmount === paymentStatus.totalAmount)) {
      // A fully settled bill proves all positive items were paid. Before full payment,
      // attribution is certain only if this course comprises the whole net balance.
      const onlyThisCourse = totalAmount === paymentStatus.totalAmount
      const paidAmount = onlyThisCourse ? paymentStatus.paidAmount : totalAmount
      state = {
        ok: true,
        totalAmount,
        paidAmount,
        remainingAmount: totalAmount - paidAmount,
        isFullyPaid: paidAmount === totalAmount,
        lastPaidOn: onlyThisCourse || payments.length === 1 ? paymentStatus.lastPaidOn : null
      }
    } else {
      state = review(COURSE_PAYMENT_REVIEW.PAYMENT_UNASSIGNED, totalAmount)
    }

    result.set(courseId, state)
  }

  return result
}

async function getIssuedCoursePaymentStatuses(bills, transaction) {
  const issuedBills = [...new Map(bills
    .filter(bill => bill.status === TUITION_BILL_STATUS.ISSUED)
    .map(bill => [bill.id, bill])).values()]
  const billIds = issuedBills.map(bill => bill.id)
  if (billIds.length === 0) return new Map()

  const where = { TuitionBillId: { [Op.in]: billIds } }
  const [items, paymentData, refundedBills] = await Promise.all([
    TuitionBillItem.findAll({
      attributes: ['id', 'TuitionBillId', 'CourseId', 'kind', 'amount'],
      where,
      raw: true,
      transaction
    }),
    getIssuedTuitionBillPaymentData(issuedBills, transaction),
    TuitionBillRefund.findAll({
      attributes: ['TuitionBillId'],
      where,
      group: ['TuitionBillId'],
      raw: true,
      transaction
    })
  ])

  const inputs = new Map(billIds.map(billId => [billId, { ...paymentData.get(billId), items: [] }]))
  for (const item of items) inputs.get(item.TuitionBillId).items.push(item)
  const validInputs = new Map([...inputs].filter(([, input]) => input.paymentStatus?.ok))
  const allocations = await getAllocationStates(validInputs, transaction)
  const refundedIds = new Set(refundedBills.map(refund => refund.TuitionBillId))

  return new Map([...inputs].map(([billId, input]) => [
    billId,
    summarizeCoursePayments({
      ...input,
      allocation: allocations.get(billId),
      hasRefund: refundedIds.has(billId)
    })
  ]))
}

module.exports = { getIssuedCoursePaymentStatuses }
