const { Op, Transaction } = require('sequelize')
const { Payment, Student, TuitionBill, TuitionBillRefund, TuitionPaymentGroup, sequelize } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { getTaipeiDate, getTaipeiMonthRange, isTaipeiDateKey } = require('../utils/date')

const { getGroupPaymentRows, groupPaymentAllocationsAreValid } = require('./tuitionPaymentGroupService')
const { CASH_KIND, CASH_REVIEW } = require('../constants/tuitionCashflow')
const DATE_SHAPE = require('../constants/cashflowDatePattern')

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
    billNo: bill?.billNo ?? null,
    studentNo: bill?.Student?.studentNo ?? null,
    billAvailable: Number.isSafeInteger(bill?.id),
    billingMonth: bill?.billingMonth ?? null,
    studentName: bill?.studentNameSnapshot ?? null,
    date: date ?? null,
    amount: record.amount,
    review
  }
}

async function getGroupedCashRows(period, today, transaction) {
  const groups = await TuitionPaymentGroup.findAll({
    attributes: ['id', 'StudentId', 'billingMonth', 'studentNameSnapshot', 'paidOn', 'amount'],
    where: { paidOn: period },
    include: [{ model: Student, attributes: ['studentNo'], required: false }],
    raw: true,
    nest: true,
    transaction
  })
  const byGroupId = new Map(groups.map(group => [group.id, []]))
  const payments = await getGroupPaymentRows([...byGroupId.keys()], transaction)
  for (const payment of payments) byGroupId.get(payment.TuitionPaymentGroupId).push(payment)

  return groups.map(group => {
    const allocations = byGroupId.get(group.id)
    let review = null
    if (!isTaipeiDateKey(group.paidOn) || group.paidOn > today) {
      review = CASH_REVIEW.DATE
    } else if ((!Number.isSafeInteger(group.amount) || group.amount < 1)) {
      review = CASH_REVIEW.AMOUNT
    } else if (
      !getTaipeiMonthRange(group.billingMonth) ||
      !groupPaymentAllocationsAreValid(group, allocations)
    ) {
      review = CASH_REVIEW.GROUP
    }

    return {
      kind: CASH_KIND.PAYMENT,
      id: group.id,
      paymentGroupId: group.id,
      billIds: review === null ? allocations.map(payment => payment.TuitionBillId) : [],
      billingMonth: group.billingMonth,
      studentNo: group.Student?.studentNo ?? null,
      studentName: group.studentNameSnapshot,
      date: group.paidOn,
      amount: group.amount,
      review
    }
  })
}

function compareCashRows(a, b) {
  return String(b.date ?? '').localeCompare(String(a.date ?? '')) ||
    a.kind.localeCompare(b.kind) || b.id - a.id ||
    Number(Boolean(b.paymentGroupId)) - Number(Boolean(a.paymentGroupId))
}

async function getTuitionCashflow(cashMonth) {
  const range = getTaipeiMonthRange(cashMonth)
  if (!range) return { ok: false, code: 'INVALID_CASH_MONTH' }

  const today = getTaipeiDate()
  const period = { [Op.gte]: range.monthStart, [Op.lt]: range.nextMonthStart }
  const billJoin = {
    model: TuitionBill,
    attributes: ['id', 'billNo', 'billingMonth', 'studentNameSnapshot', 'status'],
    include: [{ model: Student, attributes: ['studentNo'], required: false }],
    required: false
  }
  return sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    readOnly: true
  }, async transaction => {
    const [payments, refunds, groupedCashRows] = await Promise.all([
      Payment.findAll({
        attributes: ['id', 'time', 'amount', 'TuitionId', 'TuitionBillId'],
        where: {
          // Grouped bill payments are allocations; count the parent transfer once.
          TuitionBillId: { [Op.ne]: null },
          TuitionPaymentGroupId: null,
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
      }),
      getGroupedCashRows(period, today, transaction)
    ])

    const candidates = [
      ...payments.map(payment => cashRow(payment, CASH_KIND.PAYMENT, today)),
      ...refunds.map(refund => cashRow(refund, CASH_KIND.REFUND, today)),
      ...groupedCashRows
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
