const { Op, Transaction, json } = require('sequelize')
const { TuitionBill, TuitionBillItem, TuitionBillRefund, AuditLog, sequelize } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const { parseTaipeiDateTime, getTaipeiDate } = require('../utils/date')
const { getTuitionBillPaymentStatus } = require('./tuitionPaymentStateService')

async function hasTuitionBillRefund(billId, transaction) {
  const refund = await TuitionBillRefund.findOne({
    attributes: ['id'],
    where: { TuitionBillId: billId },
    transaction,
    raw: true
  })
  return refund !== null
}

async function getTuitionBillRefundSummary(billId, payment, transaction) {
  const rows = await TuitionBillRefund.findAll({
    attributes: ['id', 'amount', 'refundedOn', 'reason'],
    where: { TuitionBillId: billId },
    order: [['refundedOn', 'DESC'], ['id', 'DESC']],
    raw: true,
    transaction
  })
  const refundedAmount = rows.reduce((sum, row) => sum + row.amount, 0)
  if (
    rows.some(row => !Number.isSafeInteger(row.amount) || row.amount <= 0) ||
    !Number.isSafeInteger(refundedAmount) || refundedAmount > payment.paidAmount
  ) {
    return { ok: false, code: 'REFUND_TOTAL_REQUIRES_REVIEW' }
  }

  const netPaidAmount = payment.paidAmount - refundedAmount
  let blockedCode = null
  if (netPaidAmount > 0) {
    if (!payment.lastPaidOn || payment.lastPaidOn > getTaipeiDate()) {
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
  return { ok: true, rows, refundedAmount, netPaidAmount, blockedCode }
}

async function recordTuitionBillRefund({ billId, billVersion, actorId, amount, refundedOn, reason } = {}) {
  if (
    ![billId, actorId, amount].every(value => Number.isSafeInteger(value) && value > 0) ||
    amount > 2_147_483_647 ||
    !Number.isSafeInteger(billVersion) || billVersion < 0 || billVersion >= 2_147_483_647
  ) return { ok: false, code: 'INVALID_INPUT' }

  const note = typeof reason === 'string' ? reason.trim() : ''
  if (!note || note.length > 255) return { ok: false, code: 'INVALID_REFUND_REASON' }
  if (
    typeof refundedOn !== 'string' ||
    !parseTaipeiDateTime(`${refundedOn}T00:00`) ||
    refundedOn > getTaipeiDate()
  ) return { ok: false, code: 'INVALID_REFUND_DATE' }

  return sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  }, async transaction => {
    // 和收款、請假折抵共用來源帳單的鎖，核對後才能登記。
    const bill = await TuitionBill.findByPk(billId, { transaction, lock: transaction.LOCK.UPDATE })
    if (!bill) return { ok: false, code: 'BILL_NOT_FOUND' }
    if (bill.status !== TUITION_BILL_STATUS.ISSUED) return { ok: false, code: 'BILL_NOT_ISSUED' }
    if (bill.version !== billVersion) return { ok: false, code: 'BILL_VERSION_CONFLICT' }

    const payment = await getTuitionBillPaymentStatus(bill.id, transaction)
    if (!payment.ok) return payment
    if (!payment.isFullyPaid) return { ok: false, code: 'BILL_NOT_FULLY_PAID' }

    const summary = await getTuitionBillRefundSummary(bill.id, payment, transaction)
    if (!summary.ok) return summary
    if (summary.blockedCode) return { ok: false, code: summary.blockedCode }
    if (amount > summary.netPaidAmount) return { ok: false, code: 'REFUND_EXCEEDS_PAID_AMOUNT' }
    if (refundedOn < payment.lastPaidOn) return { ok: false, code: 'INVALID_REFUND_DATE' }

    const refund = await TuitionBillRefund.create({
      TuitionBillId: bill.id,
      amount,
      refundedOn,
      reason: note,
      actorId
    }, { transaction })

    const version = bill.version + 1
    const refundedAmount = summary.refundedAmount + amount
    await bill.update({ version }, { transaction })
    await AuditLog.create({
      actorId,
      entityType: 'TuitionBill',
      entityId: bill.id,
      action: 'update',
      before: { refundedAmount: summary.refundedAmount, version: billVersion },
      after: { refundId: refund.id, refundAmount: amount, refundedOn, refundedAmount, version },
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
