// 依帳單明細與實際收款分攤推算各課程的收費狀態。

const COURSE_PAYMENT_REVIEW = require('../constants/coursePaymentReview')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')

const { getIssuedTuitionBillFinancialData } = require('./tuitionBillFinancialService')
const { buildPayableItems } = require('./tuitionPaymentAllocationService')
const { getLastPaidOn } = require('./tuitionPaymentStateService')

function review(code, totalAmount = null) {
  return {
    ok: false, code, totalAmount, paidAmount: null, remainingAmount: null,
    refundedAmount: null, netReceivedAmount: null, lastPaidOn: null
  }
}

function paymentState(totalAmount, paidAmount, lastPaidOn, refundedAmount = 0) {
  return {
    ok: true,
    totalAmount,
    paidAmount,
    remainingAmount: totalAmount - paidAmount,
    refundedAmount,
    netReceivedAmount: paidAmount - refundedAmount,
    isFullyPaid: totalAmount > 0 && paidAmount === totalAmount,
    lastPaidOn
  }
}

function summarizeCoursePayments({ items, payments, paymentStatus, paymentAllocation, refundLedger }) {
  const courseItems = new Map()
  for (const item of items) {
    if (item.kind !== TUITION_BILL_ITEM_KIND.COURSE_FEE || !Number.isSafeInteger(item.CourseId) || item.CourseId < 1) continue
    const group = courseItems.get(item.CourseId) ?? []
    group.push(item)
    courseItems.set(item.CourseId, group)
  }

  // Same adjusted amounts as checkout, including item order and rounding.
  const payableItems = paymentAllocation?.itemized
    ? paymentAllocation.items
    : paymentStatus?.ok ? buildPayableItems(items, paymentStatus.totalAmount) : null
  const payableById = new Map((payableItems ?? []).map(item => [item.itemId, item]))
  const paymentsById = new Map(payments.map(payment => [payment.id, payment]))
  const result = new Map()

  for (const [courseId, lines] of courseItems) {
    const totalAmount = payableItems
      ? lines.reduce((sum, line) => sum + (payableById.get(line.id)?.amount ?? 0), 0)
      : null

    let state
    if (!paymentAllocation?.ok || totalAmount === null) {
      state = review(COURSE_PAYMENT_REVIEW.ALLOCATION_INVALID, totalAmount)
    } else if (totalAmount === 0) {
      state = paymentState(0, 0, null)
    } else if (!refundLedger?.ok) {
      state = review(COURSE_PAYMENT_REVIEW.REFUND_INVALID, totalAmount)
    } else if (refundLedger.hasUnassignedRefunds) {
      // A legacy bill-wide refund cannot establish any one course's net receipts.
      state = review(COURSE_PAYMENT_REVIEW.REFUND_UNASSIGNED, totalAmount)
    } else if (paymentAllocation.itemized) {
      const paidItems = lines.map(line => payableById.get(line.id)).filter(item => item?.paymentId != null)
      const paidAmount = paidItems.reduce((sum, item) => sum + item.amount, 0)
      const refundedAmount = paidItems.reduce((sum, item) =>
        sum + (refundLedger.refundedByAllocationId.get(item.allocationId) ?? 0), 0
      )
      const paymentIds = new Set(paidItems.map(item => item.paymentId))
      state = paymentState(
        totalAmount, paidAmount, getLastPaidOn([...paymentIds].map(id => paymentsById.get(id))), refundedAmount
      )
    } else if (
      paymentAllocation.reason === 'LEGACY_UNALLOCATED_PAYMENT' &&
      (paymentStatus.isFullyPaid || totalAmount === paymentStatus.totalAmount)
    ) {
      // Settlement is certain, but an unassigned date is not inferred across items.
      const onlyThisCourse = totalAmount === paymentStatus.totalAmount
      const paidAmount = onlyThisCourse ? paymentStatus.paidAmount : totalAmount
      const lastPaidOn = onlyThisCourse || payments.length === 1 ? paymentStatus.lastPaidOn : null
      state = paymentState(totalAmount, paidAmount, lastPaidOn)
    } else {
      state = review(COURSE_PAYMENT_REVIEW.PAYMENT_UNASSIGNED, totalAmount)
    }

    result.set(courseId, state)
  }

  return result
}

async function getIssuedCoursePaymentStatuses(bills, transaction) {
  const financialData = await getIssuedTuitionBillFinancialData(bills, transaction)
  return new Map([...financialData].map(([billId, data]) => [billId, summarizeCoursePayments(data)]))
}

module.exports = { getIssuedCoursePaymentStatuses }
