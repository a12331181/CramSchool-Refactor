const { getTuitionDocumentNo } = require('./tuitionBillReference')
const { formatReferenceLabel } = require('./referenceLabel')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')

const numbers = new Intl.NumberFormat('zh-TW')
const money = amount => `${amount < 0 ? '-' : ''}NT$ ${numbers.format(Math.abs(amount))}`
const singleLine = text => typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''

function buildTuitionPaymentNotice(bill, paymentStatus, refundSummary) {
  const hasRefund =
    paymentStatus?.isFullyPaid && refundSummary?.ok && refundSummary.refundedAmount > 0 &&
    refundSummary.netPaidAmount === paymentStatus.paidAmount - refundSummary.refundedAmount
  if (
    bill.status !== TUITION_BILL_STATUS.ISSUED || !paymentStatus?.ok ||
    (!(paymentStatus.remainingAmount > 0) && !hasRefund) ||
    paymentStatus.totalAmount !== bill.totalAmount ||
    bill.items.length === 0
  ) return null

  const studentName = singleLine(bill.studentNameSnapshot)
  if (!studentName || !/^\d{4}-(0[1-9]|1[0-2])$/.test(bill.billingMonth)) return null
  const itemLines = []
  let itemTotal = 0

  for (const { descriptionSnapshot, quantity, unitPrice, amount, Course } of bill.items) {
    const description = singleLine(descriptionSnapshot)
    if (!description || !Number.isSafeInteger(amount)) return null

    const calculation =
      Number.isSafeInteger(quantity) && quantity > 1 &&
      Number.isSafeInteger(unitPrice) && unitPrice >= 0 && quantity * unitPrice === amount
        ? `（${quantity} × ${money(unitPrice)}）`
        : ''
    itemLines.push(`・${formatReferenceLabel(Course?.courseNo, description)}${calculation}：${money(amount)}`)
    itemTotal += amount
  }

  if (itemTotal !== bill.totalAmount) return null

  const { totalAmount, paidAmount, remainingAmount } = paymentStatus
  const heading = hasRefund ? '家長退費通知' : '家長繳費通知'
  const totals = [
    `本期應收：${money(totalAmount)}`,
    ...(paidAmount > 0 ? [`已收金額：${money(paidAmount)}`] : [])
  ]
  if (hasRefund) {
    totals.push(
      `累計已退：${money(refundSummary.refundedAmount)}`,
      `扣除退費後實收：${money(refundSummary.netPaidAmount)}`,
      '本期已結清，無須再繳費。'
    )
  } else {
    totals.push(`尚需繳費：${money(remainingAmount)}`)
  }

  const text = [
    `家長您好，以下是 ${studentName} ${bill.billingMonth} 的${hasRefund ? '退費摘要' : '學費明細'}：`,
    '',
    `帳單編號：${getTuitionDocumentNo(bill)}`,
    ...itemLines,
    '',
    ...totals,
    '',
    '再麻煩您確認，謝謝！'
  ].join('\n')
  return { heading, text, copyLabel: hasRefund ? '複製退費通知' : '複製繳費通知' }
}

function buildMonthlyPaymentNotice({ billingMonth, bills = [], summary }) {
  const { paymentStatus, refunds } = summary ?? {}
  if (!paymentStatus?.ok || !refunds?.ok ||
      typeof billingMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) return null

  const issued = bills.filter(bill => bill.status === TUITION_BILL_STATUS.ISSUED)
  if (!issued.length || issued.length !== summary.issuedCount ||
      summary.issuedAmount !== paymentStatus.totalAmount ||
      refunds.netReceivedAmount !== paymentStatus.paidAmount - refunds.refundedAmount) return null

  const studentName = singleLine(issued[0].studentNameSnapshot)
  if (!studentName) return null

  const lines = issued.map(bill => {
    const state = bill.paymentStatus
    if (!state?.ok || !bill.refunds?.ok || state.totalAmount !== bill.totalAmount) return null

    const names = (bill.courseNames ?? []).map(singleLine).filter(Boolean).join('、')
    const label = bill.SupplementCourseId == null ? '主帳單' : '補單'
    const refund = bill.refunds.refundedAmount > 0 ? `｜已退 ${money(bill.refunds.refundedAmount)}` : ''
    return `・${label} ${getTuitionDocumentNo(bill)}${names ? '（' + names + '）' : ''}：應收 ${money(state.totalAmount)}｜已收 ${money(state.paidAmount)}${refund}｜待繳 ${money(state.remainingAmount)}`
  })
  if (lines.some(line => line === null)) return null

  return {
    heading: '家長月度繳費通知',
    copyLabel: '複製月度通知',
    text: [
      `家長您好，以下是 ${studentName} ${billingMonth} 的繳費總覽：`,
      '',
      ...lines,
      '',
      `本月應收：${money(paymentStatus.totalAmount)}`,
      `累計已收：${money(paymentStatus.paidAmount)}`,
      ...(refunds.refundedAmount > 0 ? [
        `累計已退：${money(refunds.refundedAmount)}`,
        `扣除退費後實收：${money(refunds.netReceivedAmount)}`
      ] : []),
      paymentStatus.remainingAmount > 0
        ? `本月尚需繳費：${money(paymentStatus.remainingAmount)}`
        : '本月已結清，無須再繳費。',
      '',
      '再麻煩您確認，謝謝！'
    ].join('\n')
  }
}

module.exports = { buildTuitionPaymentNotice, buildMonthlyPaymentNotice }
