const { createHash } = require('node:crypto')
const { Op, Transaction, UniqueConstraintError } = require('sequelize')
const { AuditLog, Payment, Student, TuitionBill, TuitionPaymentGroup, sequelize } = require('../models')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { MIN_GROUP_BILLS, MAX_GROUP_BILLS, MAX_GROUP_NOTE_LENGTH } = require('../constants/tuitionPayment')
const { getTaipeiDate, getTaipeiMonthRange, isTaipeiDateKey } = require('../utils/date')
const { isPaymentAmount, isPaymentVersion, prepareBillPayment, saveBillPayment } = require('./tuitionPaymentService')

const isId = n => Number.isSafeInteger(n) && n > 0
const isRequestKey = value =>
  typeof value === 'string' && value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)

function readGroupRequest({ studentId, billingMonth, bills, amount, paidOn, note, requestKey, actorId }) {
  if (
    ![studentId, actorId].every(isId) || !getTaipeiMonthRange(billingMonth) ||
    !isPaymentAmount(amount) || !isRequestKey(requestKey) ||
    !Array.isArray(bills) || bills.length > MAX_GROUP_BILLS ||
    !bills.every(bill => bill && isId(bill.id) && isPaymentVersion(bill.version)) ||
    new Set(bills.map(bill => bill.id)).size !== bills.length
  ) return { ok: false, code: 'INVALID_INPUT' }
  if (bills.length < MIN_GROUP_BILLS) return { ok: false, code: 'GROUP_BILLS_REQUIRED' }
  if (!isTaipeiDateKey(paidOn) || paidOn > getTaipeiDate()) return { ok: false, code: 'INVALID_PAYMENT_DATE' }

  if (note !== undefined && (typeof note !== 'string' || note.trim().length > MAX_GROUP_NOTE_LENGTH)) {
    return { ok: false, code: 'INVALID_GROUP_NOTE' }
  }
  const normalizedNote = note?.trim() ?? ''
  const sortedBills = bills.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id - b.id)
  const requestDigest = createHash('sha256').update(JSON.stringify([
    studentId, billingMonth, amount, paidOn, normalizedNote, sortedBills
  ])).digest('hex')
  return { ok: true, note: normalizedNote, sortedBills, requestDigest }
}

function previousRequest(group, expectedDigest) {
  return group.requestDigest === expectedDigest
    ? { ok: true, created: false, paymentGroupId: group.id }
    : { ok: false, code: 'GROUP_REQUEST_CONFLICT' }
}

async function recordTuitionPaymentGroup({
  studentId, billingMonth, bills, amount, paidOn, note, requestKey, actorId
} = {}) {
  const request = readGroupRequest({ studentId, billingMonth, bills, amount, paidOn, note, requestKey, actorId })
  if (!request.ok) return request
  const { sortedBills, requestDigest } = request
  const findPrevious = transaction => TuitionPaymentGroup.findOne({
    attributes: ['id', 'requestDigest'],
    where: { requestKey },
    raw: true,
    transaction
  })

  try {
    return await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
    }, async transaction => {
      const locked = { transaction, lock: transaction.LOCK.UPDATE }
      // Keep the order used by issuing and voiding bills. Single-bill payments also take the bill lock.
      const student = await Student.findByPk(studentId, { ...locked, attributes: ['id', 'name'] })
      if (!student) return { ok: false, code: 'STUDENT_NOT_FOUND' }
      const previous = await findPrevious(transaction)
      if (previous) return previousRequest(previous, requestDigest)

      const lockedBills = []
      for (const { id } of sortedBills) {
        const bill = await TuitionBill.findOne({
          ...locked,
          attributes: ['id', 'status', 'totalAmount', 'version'],
          where: { id, StudentId: studentId, billingMonth, currency: 'TWD' }
        })
        if (!bill) return { ok: false, code: 'GROUP_BILLS_UNAVAILABLE' }
        lockedBills.push(bill)
      }

      const plans = []
      let expectedAmount = 0
      for (const [index, bill] of lockedBills.entries()) {
        const plan = await prepareBillPayment(bill, { billVersion: sortedBills[index].version }, transaction)
        if (!plan.ok) return { ...plan, billId: bill.id }
        if (!plan.changed) return { ok: false, code: 'GROUP_BILLS_UNAVAILABLE' }
        expectedAmount += plan.receivedAmount
        plans.push(plan)
      }
      if (!isPaymentAmount(expectedAmount)) return { ok: false, code: 'PAYMENT_AMOUNT_OUT_OF_RANGE' }
      if (amount !== expectedAmount) return { ok: false, code: 'GROUP_AMOUNT_MISMATCH', expectedAmount }

      const group = await TuitionPaymentGroup.create({
        StudentId: student.id,
        studentNameSnapshot: student.name?.trim() || `學生 #${student.id}`,
        billingMonth,
        amount,
        paidOn,
        note: request.note,
        requestKey,
        requestDigest
      }, { transaction })

      const allocations = []
      for (const [index, bill] of lockedBills.entries()) {
        const payment = await saveBillPayment(bill, plans[index], {
          paidOn, actorId, paymentGroupId: group.id
        }, transaction)
        allocations.push({ billId: bill.id, paymentId: payment.paymentId, amount: payment.receivedAmount })
      }
      await AuditLog.create({
        actorId,
        entityType: 'TuitionPaymentGroup',
        entityId: group.id,
        action: 'create',
        after: { studentId, billingMonth, amount, paidOn, allocations },
        reason: '登記一筆匯款並分配至多張帳單'
      }, { transaction })

      return { ok: true, created: true, paymentGroupId: group.id }
    })
  } catch (error) {
    // The key is globally unique even if two requests lock different students.
    if (error instanceof UniqueConstraintError) {
      const previous = await findPrevious()
      if (previous) return previousRequest(previous, requestDigest)
    }
    throw error
  }
}

function getGroupPaymentRows(groupIds, transaction) {
  if (groupIds.length === 0) return []
  return Payment.findAll({
    attributes: ['id', 'TuitionPaymentGroupId', 'TuitionBillId', 'TuitionId', 'amount', 'time', 'isPaid'],
    where: { TuitionPaymentGroupId: { [Op.in]: groupIds } },
    include: [{
      model: TuitionBill,
      attributes: ['id', 'StudentId', 'billingMonth', 'status', 'totalAmount', 'currency', 'SupplementCourseId'],
      required: false
    }],
    order: [['TuitionBillId', 'ASC'], ['id', 'ASC']],
    raw: true,
    nest: true,
    transaction
  })
}

function groupPaymentAllocationsAreValid(group, payments) {
  if (payments.length < MIN_GROUP_BILLS || payments.length > MAX_GROUP_BILLS) return false
  const billIds = new Set()
  let allocated = 0
  for (const row of payments) {
    const bill = row.TuitionBill
    if (
      row.TuitionPaymentGroupId !== group.id || !isId(row.TuitionBillId) ||
      bill?.id !== row.TuitionBillId || billIds.has(bill.id) ||
      bill.StudentId !== group.StudentId || bill.billingMonth !== group.billingMonth ||
      bill.status !== TUITION_BILL_STATUS.ISSUED || bill.currency !== 'TWD' ||
      row.TuitionId !== null || (row.isPaid !== true && row.isPaid !== 1) ||
      row.time !== group.paidOn || !isPaymentAmount(row.amount) ||
      !Number.isSafeInteger(bill.totalAmount) || row.amount > bill.totalAmount
    ) return false
    billIds.add(bill.id)
    allocated += row.amount
  }
  return allocated === group.amount
}

async function getTuitionPaymentGroup(paymentGroupId) {
  if (!isId(paymentGroupId)) return null

  return sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    readOnly: true
  }, async transaction => {
    const group = await TuitionPaymentGroup.findByPk(paymentGroupId, {
      attributes: ['id', 'StudentId', 'billingMonth', 'studentNameSnapshot', 'paidOn', 'amount', 'note'],
      raw: true,
      transaction
    })
    if (!group) return null
    const payments = await getGroupPaymentRows([group.id], transaction)
    const requiresReview = !getTaipeiMonthRange(group.billingMonth) ||
      !isTaipeiDateKey(group.paidOn) || group.paidOn > getTaipeiDate() ||
      !isPaymentAmount(group.amount) || !groupPaymentAllocationsAreValid(group, payments)

    return { group, allocations: requiresReview ? [] : payments, requiresReview }
  })
}

module.exports = {
  recordTuitionPaymentGroup,
  getTuitionPaymentGroup,
  getGroupPaymentRows,
  groupPaymentAllocationsAreValid
}
