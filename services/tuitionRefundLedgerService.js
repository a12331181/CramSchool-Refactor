// 核對帳單與明細已退、可退金額及退款分攤。

const { Op } = require('sequelize')

const { TuitionBillRefund, TuitionBillRefundAllocation } = require('../models')

const isPositiveAmount = value => Number.isSafeInteger(value) && value > 0

function getPaidItems(allocation) {
  if (!allocation?.ok || !allocation.itemized) return []
  return allocation.items.filter(item => isPositiveAmount(item.allocationId) && item.paymentId != null)
}

function summarizeRefundLedger({ paymentStatus, paidItems, refunds, allocations }) {
  const paidAmount = paymentStatus?.paidAmount
  const refundedAmount = refunds.reduce((sum, refund) => sum + refund.amount, 0)
  if (
    !paymentStatus?.ok || !Number.isSafeInteger(paidAmount) || paidAmount < 0 ||
    refunds.some(refund => !isPositiveAmount(refund.amount)) ||
    !Number.isSafeInteger(refundedAmount) || refundedAmount > paidAmount
  ) return { ok: false, code: 'REFUND_TOTAL_REQUIRES_REVIEW' }

  const invalid = { ok: false, code: 'REFUND_ALLOCATIONS_REQUIRE_REVIEW' }
  const paidById = new Map(paidItems.map(item => [item.allocationId, item]))
  const byRefundId = new Map(refunds.map(refund => [refund.id, new Map()]))
  const refundedByAllocationId = new Map()
  for (const line of allocations) {
    const detail = byRefundId.get(line.TuitionBillRefundId)
    const source = paidById.get(line.TuitionPaymentAllocationId)
    if (!detail || !source || !isPositiveAmount(line.amount) || detail.has(source.allocationId)) return invalid

    const cumulative = (refundedByAllocationId.get(source.allocationId) ?? 0) + line.amount
    if (!Number.isSafeInteger(cumulative) || cumulative > source.amount) return invalid
    refundedByAllocationId.set(source.allocationId, cumulative)
    detail.set(source.allocationId, {
      allocationId: source.allocationId,
      itemId: source.itemId,
      description: source.description,
      amount: line.amount
    })
  }

  const rows = []
  for (const refund of refunds) {
    const items = [...byRefundId.get(refund.id).values()]
    if (items.length > 0 && items.reduce((sum, item) => sum + item.amount, 0) !== refund.amount) {
      return invalid
    }
    rows.push({ ...refund, items, unassigned: items.length === 0 })
  }

  const items = paidItems.map(item => {
    const refunded = refundedByAllocationId.get(item.allocationId) ?? 0
    return {
      allocationId: item.allocationId,
      itemId: item.itemId,
      description: item.description,
      paidAmount: item.amount,
      refundedAmount: refunded,
      remainingAmount: item.amount - refunded
    }
  })

  return {
    ok: true,
    rows,
    items,
    refundedByAllocationId,
    hasUnassignedRefunds: rows.some(row => row.unassigned),
    refundedAmount,
    netPaidAmount: paidAmount - refundedAmount
  }
}

async function getRefundLedgers(inputByBillId, transaction) {
  if (inputByBillId.size === 0) return new Map()

  const summaries = new Map()
  const sourceOwners = new Map()
  const refundOwners = new Map()

  for (const [billId, { paymentStatus, paymentAllocation }] of inputByBillId) {
    const paidItems = getPaidItems(paymentAllocation)
    summaries.set(billId, { paymentStatus, paidItems, refunds: [], allocations: [] })
    for (const item of paidItems) sourceOwners.set(item.allocationId, billId)
  }

  const refunds = await TuitionBillRefund.findAll({
    attributes: ['id', 'TuitionBillId', 'amount', 'refundedOn', 'reason'],
    where: { TuitionBillId: { [Op.in]: [...summaries.keys()] } },
    order: [['refundedOn', 'DESC'], ['id', 'DESC']],
    raw: true,
    transaction
  })

  for (const refund of refunds) {
    summaries.get(refund.TuitionBillId).refunds.push(refund)
    refundOwners.set(refund.id, refund.TuitionBillId)
  }

  const references = []
  if (refundOwners.size > 0) references.push({ TuitionBillRefundId: { [Op.in]: [...refundOwners.keys()] } })
  if (sourceOwners.size > 0) references.push({ TuitionPaymentAllocationId: { [Op.in]: [...sourceOwners.keys()] } })
  const allocations = references.length === 0 ? [] : await TuitionBillRefundAllocation.findAll({
    attributes: ['TuitionBillRefundId', 'TuitionPaymentAllocationId', 'amount'],
    where: { [Op.or]: references },
    order: [['id', 'ASC']],
    raw: true,
    transaction
  })

  for (const line of allocations) {
    const refundBillId = refundOwners.get(line.TuitionBillRefundId)
    const sourceBillId = sourceOwners.get(line.TuitionPaymentAllocationId)
    if (refundBillId !== undefined) summaries.get(refundBillId).allocations.push(line)
    // Include inconsistent lines on both sides so neither bill can use a wrong balance.
    if (sourceBillId !== undefined && sourceBillId !== refundBillId) {
      summaries.get(sourceBillId).allocations.push(line)
    }
  }

  return new Map([...summaries].map(([billId, input]) => [billId, summarizeRefundLedger(input)]))
}

function getRefundLedger(billId, { paymentStatus, paymentAllocation }, transaction) {
  return getRefundLedgers(new Map([[billId, { paymentStatus, paymentAllocation }]]), transaction)
    .then(ledgers => ledgers.get(billId))
}

module.exports = { getRefundLedger, getRefundLedgers }
