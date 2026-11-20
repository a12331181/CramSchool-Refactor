const { Op, Transaction } = require('sequelize')
const { Payment, TuitionBill, TuitionBillRefund, sequelize } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { getTaipeiDate, getTaipeiMonthRange, isTaipeiDateKey } = require('../utils/date')

const { CASH_KIND, CASH_REVIEW } = require('../constants/tuitionCashflow')
const DATE_SHAPE = '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'

function cashRow(record, kind, today) {
  const bill = record.TuitionBill
  const date = kind === CASH_KIND.PAYMENT ? record.time : record.refundedOn
  let review = null
  if (!isTaipeiDateKey(date) || date > today) {
    review = CASH_REVIEW.DATE
  } else if (
    bill?.status !== TUITION_BILL_STATUS.ISSUED ||
    (kind === CASH_KIND.PAYMENT && record.TuitionId !== null)
  ) {
    review = CASH_REVIEW.BILL
  } else if (!Number.isSafeInteger(record.amount) || record.amount <= 0) {
    review = CASH_REVIEW.AMOUNT
  }
  return {
    kind,
    id: record.id,
    billId: record.TuitionBillId ?? null,
    billAvailable: Number.isSafeInteger(bill?.id),
    billingMonth: bill?.billingMonth ?? null,
    studentName: bill?.studentNameSnapshot ?? null,
    date: date ?? null,
    amount: record.amount,
    review
  }
}

function compareCashRows(a, b) {
  return String(b.date ?? '').localeCompare(String(a.date ?? '')) ||
    a.kind.localeCompare(b.kind) || b.id - a.id
}

async function getTuitionCashflow(cashMonth) {
  const range = getTaipeiMonthRange(cashMonth)
  if (!range) return { ok: false, code: 'INVALID_CASH_MONTH' }

  const today = getTaipeiDate()
  const period = { [Op.gte]: range.monthStart, [Op.lt]: range.nextMonthStart }
  const billJoin = {
    model: TuitionBill,
    attributes: ['id', 'billingMonth', 'studentNameSnapshot', 'status'],
    required: false
  }
  return sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    readOnly: true
  }, async transaction => {
    const [payments, refunds] = await Promise.all([
      Payment.findAll({
        attributes: ['id', 'time', 'amount', 'TuitionId', 'TuitionBillId'],
        where: {
          TuitionBillId: { [Op.ne]: null },
          isPaid: true,
          [Op.or]: [{ time: period }, { time: null }, { time: { [Op.notRegexp]: DATE_SHAPE } }]
        },
        include: [billJoin],
        raw: true,
        nest: true,
        transaction
      }),
      TuitionBillRefund.findAll({
        attributes: ['id', 'refundedOn', 'amount', 'TuitionBillId'],
        where: { refundedOn: period },
        include: [billJoin],
        raw: true,
        nest: true,
        transaction
      })
    ])

    const candidates = [
      ...payments.map(payment => cashRow(payment, CASH_KIND.PAYMENT, today)),
      ...refunds.map(refund => cashRow(refund, CASH_KIND.REFUND, today))
    ]
    const rows = []
    const reviewRows = []
    let received = 0
    let refunded = 0
    for (const row of candidates) {
      if (row.review) {
        reviewRows.push(row)
      } else if (row.date >= range.monthStart && row.date < range.nextMonthStart) {
        rows.push(row)
        if (row.kind === CASH_KIND.PAYMENT) received += row.amount
        else refunded += row.amount
      }
    }
    if (!Number.isSafeInteger(received) || !Number.isSafeInteger(refunded)) {
      return { ok: false, code: 'CASH_TOTALS_REQUIRE_REVIEW' }
    }
    return {
      ok: true, cashMonth,
      rows: rows.sort(compareCashRows),
      reviewRows: reviewRows.sort(compareCashRows),
      totals: { received, refunded, net: received - refunded }
    }
  })
}

module.exports = { getTuitionCashflow }
