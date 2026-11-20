const { Op } = require('sequelize')
const { TuitionBillItem } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { getAllocationStates } = require('./tuitionPaymentAllocationService')
const { getIssuedTuitionBillPaymentData } = require('./tuitionPaymentStateService')
const { getRefundLedgers } = require('./tuitionRefundLedgerService')

async function getIssuedTuitionBillFinancialData(bills, transaction) {
  const issuedBills = [...new Map(bills
    .filter(bill => bill.status === TUITION_BILL_STATUS.ISSUED)
    .map(bill => [bill.id, bill])).values()]
  const billIds = issuedBills.map(bill => bill.id)
  if (billIds.length === 0) return new Map()

  const [items, paymentData] = await Promise.all([
    TuitionBillItem.findAll({
      attributes: ['id', 'TuitionBillId', 'CourseId', 'kind', 'amount', 'descriptionSnapshot'],
      where: { TuitionBillId: { [Op.in]: billIds } },
      raw: true,
      transaction
    }),
    getIssuedTuitionBillPaymentData(issuedBills, transaction)
  ])

  const inputs = new Map(billIds.map(billId => [billId, { ...paymentData.get(billId), items: [] }]))
  for (const item of items) inputs.get(item.TuitionBillId).items.push(item)

  const validInputs = new Map([...inputs].filter(([, input]) => input.paymentStatus?.ok))
  const allocations = await getAllocationStates(validInputs, transaction)
  const ledgers = await getRefundLedgers(new Map([...validInputs].map(([billId, { paymentStatus }]) => [
    billId, { paymentStatus, paymentAllocation: allocations.get(billId) }
  ])), transaction)

  return new Map([...inputs].map(([billId, data]) => [
    billId, {
      ...data,
      paymentAllocation: allocations.get(billId),
      refundLedger: ledgers.get(billId)
    }
  ]))
}

function getBillRefundAmounts(ledger) {
  return {
    ok: ledger?.ok === true,
    refundedAmount: ledger?.refundedAmount,
    netReceivedAmount: ledger?.netPaidAmount
  }
}

function sumKnownAmounts(amounts) {
  let total = 0
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) return null
    total += amount
    if (!Number.isSafeInteger(total)) return null
  }
  return total
}

function combinePaymentStatuses(statuses) {
  if (statuses.length === 0) return null
  if (statuses.length === 1) return statuses[0] ?? { ok: false }

  const aggregate = field => sumKnownAmounts(statuses.map(status => status?.[field]))
  const totalAmount = aggregate('totalAmount')
  const invalid = statuses.find(status => status?.ok !== true)
  if (statuses.some(status => status?.ok !== true)) {
    return { ok: false, totalAmount, code: invalid?.code }
  }

  const paidAmount = aggregate('paidAmount')
  const remainingAmount = aggregate('remainingAmount')
  if ([totalAmount, paidAmount, remainingAmount].some(amount => amount === null)) {
    return { ok: false, totalAmount }
  }
  const paidRows = statuses.filter(status => status.paidAmount > 0)
  const paidDates = paidRows.map(status => status.lastPaidOn)
  const lastPaidOn = paidDates.every(Boolean) ? paidDates.sort().at(-1) ?? null : null

  return {
    ok: true,
    totalAmount,
    paidAmount,
    remainingAmount,
    isFullyPaid: totalAmount > 0 && remainingAmount === 0,
    lastPaidOn
  }
}

function summarizeStudentBillGroup(bills, financialData) {
  const issued = bills.filter(bill => bill.status === TUITION_BILL_STATUS.ISSUED)
  const drafts = bills.filter(bill => bill.status === TUITION_BILL_STATUS.DRAFT)
  const paymentStatus = combinePaymentStatuses(
    issued.map(bill => financialData.get(bill.id)?.paymentStatus)
  )
  const ledgers = issued.map(bill => financialData.get(bill.id)?.refundLedger)
  const refundedAmount = sumKnownAmounts(ledgers.map(ledger => ledger?.refundedAmount))
  const netReceivedAmount = sumKnownAmounts(ledgers.map(ledger => ledger?.netPaidAmount))
  const refunds = ledgers.length === 0 ? null : {
    ok: ledgers.every(ledger => ledger?.ok) && refundedAmount !== null && netReceivedAmount !== null,
    refundedAmount,
    netReceivedAmount
  }

  return {
    issuedCount: issued.length,
    draftCount: drafts.length,
    issuedAmount: sumKnownAmounts(issued.map(bill => bill.totalAmount)),
    draftAmount: sumKnownAmounts(drafts.map(bill => bill.totalAmount)),
    paymentStatus,
    refunds
  }
}

module.exports = {
  getIssuedTuitionBillFinancialData,
  getBillRefundAmounts,
  sumKnownAmounts,
  combinePaymentStatuses,
  summarizeStudentBillGroup
}
