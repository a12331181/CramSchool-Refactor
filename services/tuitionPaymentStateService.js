const { Op } = require('sequelize')
const { Payment, TuitionBill } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { isTaipeiDateKey } = require('../utils/date')

function getTuitionBillPaymentState(paymentStatus) {
  if (!paymentStatus?.ok) return 'payment_review'
  if (paymentStatus.totalAmount === 0) return 'no_payment'
  if (paymentStatus.isFullyPaid) return 'paid'
  return paymentStatus.paidAmount > 0 ? 'partial' : 'unpaid'
}

async function getTuitionBillPaymentStatus(billId, transaction) {
  if (!Number.isSafeInteger(billId) || billId < 1) {
    return { ok: false, code: 'INVALID_BILL_ID' }
  }

  const bill = await TuitionBill.findByPk(billId, {
    attributes: ['id', 'status', 'totalAmount'],
    raw: true,
    transaction
  })

  if (!bill) return { ok: false, code: 'BILL_NOT_FOUND' }
  if (bill.status !== TUITION_BILL_STATUS.ISSUED) return { ok: false, code: 'BILL_NOT_ISSUED' }

  const statuses = await getIssuedTuitionBillPaymentStatuses([bill], transaction)
  return statuses.get(bill.id)
}

function getPaidTuitionBillPayments(billIds, transaction) {
  return Payment.findAll({
    attributes: ['id', 'TuitionBillId', 'TuitionId', 'TuitionPaymentGroupId', 'amount', 'time'],
    where: { TuitionBillId: { [Op.in]: billIds }, isPaid: true },
    raw: true,
    transaction
  })
}

async function getIssuedTuitionBillPaymentData(bills, transaction) {
  const issuedBills = bills.filter(bill => bill.status === TUITION_BILL_STATUS.ISSUED)
  if (issuedBills.length === 0) return new Map()

  const billIds = issuedBills.map(bill => bill.id)
  const paymentsByBillId = new Map(billIds.map(id => [id, []]))
  const payments = await getPaidTuitionBillPayments(billIds, transaction)

  for (const payment of payments) {
    paymentsByBillId.get(payment.TuitionBillId).push(payment)
  }

  return new Map(issuedBills.map(bill => {
    const payments = paymentsByBillId.get(bill.id)
    return [bill.id, { payments, paymentStatus: summarizeTuitionBillPayments(bill, payments) }]
  }))
}

async function getIssuedTuitionBillPaymentStatuses(bills, transaction) {
  const data = await getIssuedTuitionBillPaymentData(bills, transaction)
  return new Map([...data].map(([billId, { paymentStatus }]) => [billId, paymentStatus]))
}

function getLastPaidOn(payments) {
  let lastPaidOn = null
  for (const { time } of payments) {
    if (!isTaipeiDateKey(time)) return null
    if (!lastPaidOn || time > lastPaidOn) lastPaidOn = time
  }
  return lastPaidOn
}

function summarizeTuitionBillPayments(bill, payments) {
  const { totalAmount } = bill
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0) {
    return { ok: false, code: 'INVALID_BILL_AMOUNT' }
  }

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
    isFullyPaid: totalAmount > 0 && paidAmount === totalAmount,
    lastPaidOn: getLastPaidOn(payments)
  }
}

module.exports = {
  getTuitionBillPaymentState,
  getTuitionBillPaymentStatus,
  getPaidTuitionBillPayments,
  getIssuedTuitionBillPaymentData,
  getIssuedTuitionBillPaymentStatuses,
  getLastPaidOn,
  summarizeTuitionBillPayments
}
