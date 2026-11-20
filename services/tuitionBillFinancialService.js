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

module.exports = { getIssuedTuitionBillFinancialData }
