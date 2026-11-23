const { MAX_TUITION_BILL_VERSION } = require('../constants/tuitionBillLimits')
const { MAX_REFUND_AMOUNT, MAX_PAYMENT_ITEMS } = require('../constants/tuitionPayment')
const { Op, Transaction, json } = require('sequelize')
const { TuitionBill, TuitionBillItem, TuitionBillRefund, TuitionBillRefundAllocation, AuditLog, sequelize } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const { isTaipeiDateKey, getTaipeiDate } = require('../utils/date')
const { getPaidTuitionBillPayments, summarizeTuitionBillPayments } = require('./tuitionPaymentStateService')
const { getAllocationState } = require('./tuitionPaymentAllocationService')
const { getRefundLedger } = require('./tuitionRefundLedgerService')

async function hasTuitionBillRefund(billId, transaction) {
  const refund = await TuitionBillRefund.findOne({
    attributes: ['id'],
    where: { TuitionBillId: billId },
    transaction,
    raw: true
  })
  return refund !== null
}

async function getTuitionBillRefundSummary(billId, { paymentStatus, paymentAllocation }, transaction) {
  const ledger = await getRefundLedger(billId, { paymentStatus, paymentAllocation }, transaction)
  if (!ledger.ok) return ledger

  let blockedCode = null
  if (ledger.netPaidAmount > 0) {
    if (paymentAllocation?.ok === false) {
      blockedCode = 'REFUND_ALLOCATIONS_REQUIRE_REVIEW'
    } else if (!paymentStatus.lastPaidOn || paymentStatus.lastPaidOn > getTaipeiDate()) {
      blockedCode = 'REFUND_PAYMENT_DATE_UNCONFIRMED'
    } else {
      const credit = await TuitionBillItem.findOne({
        attributes: ['id'],
        where: {
          kind: TUITION_BILL_ITEM_KIND.LEAVE_CREDIT,
          ActiveLeaveAttendId: { [Op.ne]: null },
          [Op.and]: json('sourceSnapshot.sourceBillId', String(billId))
        },
        raw: true,
        transaction
      })
      if (credit) blockedCode = 'REFUND_HAS_LEAVE_CREDIT'
    }
  }

  const mode = paymentAllocation?.itemized && !ledger.hasUnassignedRefunds ? 'items' : 'bill'
  return { ...ledger, mode, blockedCode }
}

const isPositiveInteger = value => Number.isSafeInteger(value) && value > 0

function readRefundAmount(amount, refundItems) {
  const invalid = { ok: false, code: 'INVALID_INPUT' }
  if (refundItems === undefined) {
    return isPositiveInteger(amount) && amount <= MAX_REFUND_AMOUNT ? { ok: true, amount } : invalid
  }
  if (amount !== undefined || !Array.isArray(refundItems) || refundItems.length > MAX_PAYMENT_ITEMS) return invalid
  if (refundItems.length === 0) return { ok: false, code: 'REFUND_ITEMS_REQUIRED' }

  const ids = new Set()
  let total = 0
  for (const item of refundItems) {
    if (!isPositiveInteger(item?.allocationId) || !isPositiveInteger(item?.amount) || ids.has(item.allocationId)) {
      return invalid
    }
    ids.add(item.allocationId)
    total += item.amount
  }

  return isPositiveInteger(total) && total <= MAX_REFUND_AMOUNT ? { ok: true, amount: total } : invalid
}

function selectRefundAllocations(summary, { amount, refundItems }) {
  if (summary.mode !== 'items') {
    return refundItems === undefined
      ? { ok: true, items: [] }
      : { ok: false, code: 'REFUND_ITEMS_UNAVAILABLE' }
  }

  const available = summary.items.filter(item => item.remainingAmount > 0)
  const byId = new Map(available.map(item => [item.allocationId, item]))
  let selection = refundItems
  if (selection === undefined) {
    if (amount === summary.netPaidAmount) {
      selection = available.map(item => ({ allocationId: item.allocationId, amount: item.remainingAmount }))
    } else if (available.length === 1) {
      selection = [{ allocationId: available[0].allocationId, amount }]
    } else {
      return { ok: false, code: 'REFUND_ITEMS_REQUIRED' }
    }
  }

  const items = []
  for (const { allocationId, amount } of selection) {
    const item = byId.get(allocationId)
    if (!item) return { ok: false, code: 'REFUND_ITEMS_CHANGED' }
    if (amount > item.remainingAmount) return { ok: false, code: 'REFUND_ITEM_EXCEEDS_PAID_AMOUNT' }
    items.push({ allocationId, itemId: item.itemId, amount })
  }
  return { ok: true, items }
}

async function recordTuitionBillRefund({ billId, billVersion, actorId, amount, refundItems, refundedOn, reason } = {}) {
  if (
    ![billId, actorId].every(isPositiveInteger) ||
    !Number.isSafeInteger(billVersion) || billVersion < 0 || billVersion >= MAX_TUITION_BILL_VERSION
  ) return { ok: false, code: 'INVALID_INPUT' }

  const request = readRefundAmount(amount, refundItems)
  if (!request.ok) return request

  const note = typeof reason === 'string' ? reason.trim() : ''
  if (!note || note.length > 255) return { ok: false, code: 'INVALID_REFUND_REASON' }
  if (
    !isTaipeiDateKey(refundedOn) || refundedOn > getTaipeiDate()
  ) return { ok: false, code: 'INVALID_REFUND_DATE' }

  return sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  }, async transaction => {
    // 收款、退費和請假折抵共用這張來源帳單的鎖。
    const bill = await TuitionBill.findByPk(billId, { transaction, lock: transaction.LOCK.UPDATE })
    if (!bill) return { ok: false, code: 'BILL_NOT_FOUND' }
    if (bill.status !== TUITION_BILL_STATUS.ISSUED) return { ok: false, code: 'BILL_NOT_ISSUED' }
    if (bill.version !== billVersion) return { ok: false, code: 'BILL_VERSION_CONFLICT' }

    const payments = await getPaidTuitionBillPayments([bill.id], transaction)
    const paymentStatus = summarizeTuitionBillPayments(bill, payments)
    if (!paymentStatus.ok) return paymentStatus
    if (!paymentStatus.isFullyPaid) return { ok: false, code: 'BILL_NOT_FULLY_PAID' }

    const items = await TuitionBillItem.findAll({
      attributes: ['id', 'kind', 'descriptionSnapshot', 'amount'],
      where: { TuitionBillId: bill.id },
      raw: true,
      transaction
    })
    const paymentAllocation = await getAllocationState({ items, payments, paymentStatus }, transaction)
    const summary = await getTuitionBillRefundSummary(bill.id, { paymentStatus, paymentAllocation }, transaction)
    if (!summary.ok) return summary
    if (summary.blockedCode) return { ok: false, code: summary.blockedCode }
    if (request.amount > summary.netPaidAmount) return { ok: false, code: 'REFUND_EXCEEDS_PAID_AMOUNT' }
    if (refundedOn < paymentStatus.lastPaidOn) return { ok: false, code: 'INVALID_REFUND_DATE' }

    const allocation = selectRefundAllocations(summary, { amount: request.amount, refundItems })
    if (!allocation.ok) return allocation

    const refund = await TuitionBillRefund.create({
      TuitionBillId: bill.id,
      amount: request.amount,
      refundedOn,
      reason: note,
      actorId
    }, { transaction })

    if (allocation.items.length > 0) {
      await TuitionBillRefundAllocation.bulkCreate(allocation.items.map(item => ({
        TuitionBillRefundId: refund.id,
        TuitionPaymentAllocationId: item.allocationId,
        amount: item.amount
      })), { transaction, validate: true })
    }

    const version = bill.version + 1
    const refundedAmount = summary.refundedAmount + request.amount
    await bill.update({ version }, { transaction })
    await AuditLog.create({
      actorId,
      entityType: 'TuitionBill',
      entityId: bill.id,
      action: 'update',
      before: { refundedAmount: summary.refundedAmount, version: billVersion },
      after: {
        refundId: refund.id,
        refundAmount: request.amount,
        refundedOn,
        refundedAmount,
        ...(allocation.items.length > 0 ? { refundItems: allocation.items } : {}),
        version
      },
      reason: note
    }, { transaction })

    return { ok: true, refundId: refund.id }
  })
}

module.exports = {
  getTuitionBillRefundSummary,
  hasTuitionBillRefund,
  recordTuitionBillRefund
}
