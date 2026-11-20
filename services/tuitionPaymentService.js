const { AuditLog, Payment, TuitionBill, TuitionBillItem, sequelize } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { MAX_PAYMENT_AMOUNT } = require('../constants/tuitionPayment')
const { getTaipeiDate, isTaipeiDateKey } = require('../utils/date')
const { getPaidTuitionBillPayments, summarizeTuitionBillPayments } = require('./tuitionPaymentStateService')
const { MAX_PAYMENT_ITEMS, getAllocationState, createAllocations } = require('./tuitionPaymentAllocationService')

const isPositiveInteger = n => Number.isSafeInteger(n) && n > 0
const isPaymentVersion = n => Number.isSafeInteger(n) && n >= 0 && n < MAX_PAYMENT_AMOUNT
const isPaymentAmount = n => isPositiveInteger(n) && n <= MAX_PAYMENT_AMOUNT

function canReceiveBillPayment(bill, financial) {
  return bill.status === TUITION_BILL_STATUS.ISSUED && isPaymentVersion(bill.version) &&
    financial?.paymentStatus?.ok === true && isPaymentAmount(financial.paymentStatus.remainingAmount) &&
    financial?.paymentAllocation?.ok === true
}

async function prepareBillPayment(bill, { billVersion, amount, selectedItemIds }, transaction) {
  if (bill.status !== TUITION_BILL_STATUS.ISSUED) return { ok: false, code: 'BILL_NOT_ISSUED' }
  if (!isPaymentVersion(bill.version) || (billVersion !== undefined && billVersion !== bill.version)) {
    return { ok: false, code: 'BILL_VERSION_CONFLICT' }
  }

  const payments = await getPaidTuitionBillPayments([bill.id], transaction)
  const paymentStatus = summarizeTuitionBillPayments(bill, payments)
  if (!paymentStatus.ok) return paymentStatus

  const { paidAmount, remainingAmount, isFullyPaid } = paymentStatus
  if (isFullyPaid) {
    return { ok: true, changed: false, billId: bill.id, paidAmount, remainingAmount }
  }
  if (remainingAmount === 0) return { ok: false, code: 'BILL_NO_PAYMENT_REQUIRED' }

  const itemized = selectedItemIds !== undefined
  if (!itemized && amount !== undefined && amount !== remainingAmount) {
    return { ok: false, code: 'PAYMENT_AMOUNT_MISMATCH', remainingAmount }
  }

  const items = await TuitionBillItem.findAll({
    attributes: ['id', 'kind', 'descriptionSnapshot', 'amount'],
    where: { TuitionBillId: bill.id },
    raw: true,
    transaction
  })
  const allocation = await getAllocationState({ items, payments, paymentStatus }, transaction)
  if (!allocation.ok) return allocation
  if (itemized && !allocation.itemized) return { ok: false, code: 'PAYMENT_ITEMS_UNAVAILABLE' }

  const outstanding = (allocation.items ?? []).filter(item => item.amount > 0 && item.paymentId === null)
  const selected = itemized ? new Set(selectedItemIds) : null
  const paidItems = selected ? outstanding.filter(item => selected.has(item.itemId)) : outstanding
  if (selected && paidItems.length !== selected.size) return { ok: false, code: 'PAYMENT_ITEMS_CHANGED' }

  const receivedAmount = itemized ? paidItems.reduce((sum, item) => sum + item.amount, 0) : remainingAmount
  if (!isPaymentAmount(receivedAmount) || receivedAmount > remainingAmount) {
    return { ok: false, code: 'PAYMENT_AMOUNT_OUT_OF_RANGE' }
  }

  return { ok: true, changed: true, paidAmount, remainingAmount, receivedAmount, paidItems }
}

// Only called after the bill is locked and its collections and version have been checked in this transaction.
async function saveBillPayment(bill, plan, { paidOn, actorId, paymentGroupId }, transaction) {
  const { paidAmount, remainingAmount, receivedAmount, paidItems } = plan
  const payment = await Payment.create({
    TuitionBillId: bill.id,
    TuitionId: null,
    ...(paymentGroupId === undefined ? {} : { TuitionPaymentGroupId: paymentGroupId }),
    amount: receivedAmount,
    isPaid: true,
    time: paidOn
  }, { transaction })
  await createAllocations(payment.id, paidItems, transaction)
  await bill.update({ version: bill.version + 1 }, { transaction })

  const updatedPaidAmount = paidAmount + receivedAmount
  const updatedRemainingAmount = remainingAmount - receivedAmount
  await AuditLog.create({
    actorId,
    entityType: 'TuitionBill',
    entityId: bill.id,
    action: 'update',
    before: { paidAmount, remainingAmount },
    after: {
      paymentId: payment.id,
      ...(paymentGroupId === undefined ? {} : { paymentGroupId }),
      receivedAmount,
      paidAmount: updatedPaidAmount,
      remainingAmount: updatedRemainingAmount,
      ...(paidItems.length > 0 ? { allocatedItemCount: paidItems.length } : {}),
      paidOn,
      recordedAt: new Date().toISOString()
    },
    reason: paymentGroupId === undefined ? '登記帳單收款' : '合併收款分配至帳單'
  }, { transaction })

  return {
    ok: true,
    changed: true,
    billId: bill.id,
    paymentId: payment.id,
    receivedAmount,
    paidOn,
    paidAmount: updatedPaidAmount,
    remainingAmount: updatedRemainingAmount
  }
}

async function recordTuitionBillPayment({ billId, billVersion, amount, selectedItemIds, paidOn, actorId } = {}) {
  const itemized = selectedItemIds !== undefined
  if (
    ![billId, actorId].every(isPositiveInteger) ||
    ((itemized || billVersion !== undefined) && !isPaymentVersion(billVersion)) ||
    (!itemized && !isPaymentAmount(amount))
  ) return { ok: false, code: 'INVALID_INPUT' }

  if (itemized) {
    if (
      !Array.isArray(selectedItemIds) || selectedItemIds.length > MAX_PAYMENT_ITEMS ||
      !selectedItemIds.every(isPositiveInteger) || new Set(selectedItemIds).size !== selectedItemIds.length
    ) return { ok: false, code: 'INVALID_INPUT' }
    if (selectedItemIds.length === 0) return { ok: false, code: 'PAYMENT_ITEMS_REQUIRED' }
  }

  const today = getTaipeiDate()
  const receivedOn = paidOn === undefined ? today : paidOn
  if (!isTaipeiDateKey(receivedOn) || receivedOn > today) {
    return { ok: false, code: 'INVALID_PAYMENT_DATE' }
  }

  return sequelize.transaction(async transaction => {
    const bill = await TuitionBill.findByPk(billId, {
      attributes: ['id', 'status', 'totalAmount', 'version'],
      transaction,
      lock: transaction.LOCK.UPDATE
    })
    if (!bill) return { ok: false, code: 'BILL_NOT_FOUND' }

    const plan = await prepareBillPayment(bill, { billVersion, amount, selectedItemIds }, transaction)
    if (!plan.ok || !plan.changed) return plan
    return saveBillPayment(bill, plan, { actorId, paidOn: receivedOn }, transaction)
  })
}

module.exports = {
  isPaymentVersion,
  isPaymentAmount,
  canReceiveBillPayment,
  prepareBillPayment,
  saveBillPayment,
  recordTuitionBillPayment
}
