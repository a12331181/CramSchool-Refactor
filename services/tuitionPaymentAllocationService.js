const { Op } = require('sequelize')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const { TuitionPaymentAllocation } = require('../models')

const MAX_PAYMENT_ITEMS = 500

function buildPayableItems(items, totalAmount) {
  const payableItems = []
  let savedTotal = 0
  let grossTotal = 0

  for (const item of [...items].sort((a, b) => a.id - b.id)) {
    if (!Number.isSafeInteger(item.amount)) return null
    savedTotal += item.amount
    if (item.kind === TUITION_BILL_ITEM_KIND.LEAVE_CREDIT || item.kind === TUITION_BILL_ITEM_KIND.DISCOUNT) {
      if (item.amount >= 0) return null
      continue
    }
    if (![TUITION_BILL_ITEM_KIND.COURSE_FEE, TUITION_BILL_ITEM_KIND.EXTRA_FEE].includes(item.kind) || item.amount < 0) return null
    if (item.amount === 0) continue
    grossTotal += item.amount

    if (payableItems.length >= MAX_PAYMENT_ITEMS) return null
    payableItems.push({ itemId: item.id, description: item.descriptionSnapshot, grossAmount: item.amount })
  }

  if (
    !Number.isSafeInteger(savedTotal) || !Number.isSafeInteger(grossTotal) ||
    savedTotal !== totalAmount || grossTotal < totalAmount || items.length === 0
  ) return null

  if (grossTotal === 0) return []

  // 按出帳明細順序用原價比例分配整單折抵；累計取整確保各項淨額加總等於帳單總額。
  let grossSoFar = 0n
  let netSoFar = 0n
  const total = BigInt(totalAmount)
  const gross = BigInt(grossTotal)
  return payableItems.map(item => {
    grossSoFar += BigInt(item.grossAmount)
    const next = grossSoFar * total / gross
    const amount = Number(next - netSoFar)
    netSoFar = next
    return { ...item, amount }
  })
}

function findAllocations(paymentIds, billItemIds, transaction) {
  const references = []
  if (paymentIds.length > 0) references.push({ PaymentId: { [Op.in]: paymentIds } })
  if (billItemIds.length > 0) references.push({ TuitionBillItemId: { [Op.in]: billItemIds } })

  return references.length > 0
    ? TuitionPaymentAllocation.findAll({
        attributes: ['PaymentId', 'TuitionBillItemId', 'amount'],
        where: { [Op.or]: references },
        raw: true,
        transaction
      })
    : []
}

async function getAllocationState(input, transaction) {
  const allocations = await findAllocations(
    input.payments.map(payment => payment.id),
    input.items.map(item => item.id),
    transaction
  )
  return summarizeAllocationState(input, allocations)
}

async function getAllocationStates(inputByBillId, transaction) {
  const paymentOwners = new Map()
  const itemOwners = new Map()
  const allocationsByBillId = new Map()

  for (const [billId, { items, payments }] of inputByBillId) {
    allocationsByBillId.set(billId, [])
    for (const payment of payments) paymentOwners.set(payment.id, billId)
    for (const item of items) itemOwners.set(item.id, billId)
  }

  const allocations = await findAllocations([...paymentOwners.keys()], [...itemOwners.keys()], transaction)
  for (const allocation of allocations) {
    const paymentBillId = paymentOwners.get(allocation.PaymentId)
    const itemBillId = itemOwners.get(allocation.TuitionBillItemId)
    if (paymentBillId !== undefined) allocationsByBillId.get(paymentBillId).push(allocation)
    // A cross-bill link must fail reconciliation on both sides.
    if (itemBillId !== undefined && itemBillId !== paymentBillId) {
      allocationsByBillId.get(itemBillId).push(allocation)
    }
  }

  return new Map([...inputByBillId].map(([billId, input]) => [
    billId, summarizeAllocationState(input, allocationsByBillId.get(billId))
  ]))
}

function summarizeAllocationState({ items, payments, paymentStatus }, allocations) {
  if (allocations.length === 0 && payments.length > 0) {
    return { ok: true, itemized: false, reason: 'LEGACY_UNALLOCATED_PAYMENT' }
  }

  const invalid = { ok: false, code: 'PAYMENT_ALLOCATIONS_REQUIRE_REVIEW' }
  const payableItems = buildPayableItems(items, paymentStatus.totalAmount)
  if (!payableItems) return allocations.length > 0 ? invalid : { ok: true, itemized: false, reason: 'NO_PAYMENT_ITEMS' }

  const itemsById = new Map(payableItems.map(item => [item.itemId, item]))
  const paidByItemId = new Map()
  const allocatedByPayment = new Map(payments.map(payment => [payment.id, 0]))
  for (const allocation of allocations) {
    const item = itemsById.get(allocation.TuitionBillItemId)
    if (
      !allocatedByPayment.has(allocation.PaymentId) ||
      !item || item.amount <= 0 || item.amount !== allocation.amount || paidByItemId.has(item.itemId)
    ) return invalid
    paidByItemId.set(item.itemId, allocation.PaymentId)
    allocatedByPayment.set(allocation.PaymentId, allocatedByPayment.get(allocation.PaymentId) + allocation.amount)
  }

  if (payments.some(payment => allocatedByPayment.get(payment.id) !== payment.amount)) return invalid
  const remainingAmount = payableItems.reduce((sum, item) =>
    paidByItemId.has(item.itemId) ? sum : sum + item.amount, 0
  )
  if (remainingAmount !== paymentStatus.remainingAmount) return invalid

  return {
    ok: true,
    itemized: true,
    hasAdjustments: payableItems.some(item => item.amount !== item.grossAmount),
    items: payableItems.map(item => ({ ...item, paymentId: paidByItemId.get(item.itemId) ?? null }))
  }
}

function createAllocations(paymentId, items, transaction) {
  if (items.length === 0) return
  return TuitionPaymentAllocation.bulkCreate(items.map(item => ({
    PaymentId: paymentId,
    TuitionBillItemId: item.itemId,
    amount: item.amount
  })), { transaction })
}

module.exports = {
  MAX_PAYMENT_ITEMS,
  buildPayableItems,
  getAllocationState,
  getAllocationStates,
  createAllocations
}
