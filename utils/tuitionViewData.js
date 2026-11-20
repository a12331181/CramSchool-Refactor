const STUDENT_TUITION_STATUS = require('../constants/studentTuitionStatus')
const COURSE_PAYMENT_REVIEW = require('../constants/coursePaymentReview')
const { getTuitionBillPaymentState } = require('../services/tuitionPaymentStateService')

const amountFormat = new Intl.NumberFormat('zh-TW')

function getTuitionNavigationParams({ billingMonth, page, status }) {
  const params = new URLSearchParams()

  if (typeof billingMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
    params.set('billingMonth', billingMonth)
  }

  const pageNumber = Number(page)
  if (Number.isSafeInteger(pageNumber) && pageNumber > 1) {
    params.set('page', String(pageNumber))
  }

  if (typeof status === 'string' && status !== 'all' && Object.hasOwn(STUDENT_TUITION_STATUS, status)) {
    params.set('status', status)
  }

  return params
}

function withQuery(path, params) {
  return params.size ? `${path}?${params}` : path
}

function getTuitionBillPaymentStatusText(paymentStatus) {
  return STUDENT_TUITION_STATUS[getTuitionBillPaymentState(paymentStatus)]
}

function getRefundAmountText(summary, field) {
  if (!summary) return '—'
  if (!summary.ok) return '待核對'
  return `NT$ ${amountFormat.format(summary[field])}`
}

function getRefundStatusText(summary) {
  if (summary?.ok && summary.refundedAmount > 0) {
    return summary.netReceivedAmount === 0 ? '已全額退費' : '已部分退費'
  }
  return null
}

function getCoursePaymentStatusText(coursePayment) {
  if (coursePayment?.code === COURSE_PAYMENT_REVIEW.REFUND_INVALID) return '退費紀錄待核對'
  const refundStatus = coursePayment?.remainingAmount === 0 ? getRefundStatusText(coursePayment) : null
  if (refundStatus) return refundStatus
  if (coursePayment?.code === COURSE_PAYMENT_REVIEW.REFUND_UNASSIGNED) return '整單退費待核對'
  if (coursePayment?.code === COURSE_PAYMENT_REVIEW.PAYMENT_UNASSIGNED) return '分項收款待核對'
  return getTuitionBillPaymentStatusText(coursePayment)
}

module.exports = {
  amountFormat,
  getTuitionNavigationParams,
  withQuery,
  getTuitionBillPaymentStatusText,
  getRefundAmountText,
  getRefundStatusText,
  getCoursePaymentStatusText
}
