const responses = require('../constants/messages/tuitionPayment')
const { sendPageError } = require('../utils/pageError')
const { getTuitionDocumentNo } = require('../utils/tuitionBillReference')
const { formatReferenceLabel } = require('../utils/referenceLabel')
const { readUnsignedInteger } = require('../utils/formNumbers')
const { randomUUID } = require('node:crypto')
const { recordTuitionBillPayment } = require('../services/tuitionPaymentService')
const { recordTuitionBillRefund } = require('../services/tuitionRefundService')
const { getStudentTuitionBillsForMonth } = require('../services/tuitionReportService')
const tuitionPaymentGroupService = require('../services/tuitionPaymentGroupService')
const { MAX_PAYMENT_AMOUNT, MIN_GROUP_BILLS, MAX_GROUP_BILLS, MAX_GROUP_NOTE_LENGTH } = require('../constants/tuitionPayment')
const { getTaipeiDate } = require('../utils/date')
const { createSessionFormToken, isValidSessionFormToken } = require('../utils/sessionFormToken')
const REFUND_MESSAGES = require('../constants/tuitionRefundMessages')

const amountFormat = new Intl.NumberFormat('zh-TW')
const paymentGroupBase = '/cramschool/tuition/payment-groups'

function studentTuitionUrl(studentId, billingMonth, subpath) {
  return `/cramschool/tuition/students/${studentId}/${subpath}?` + new URLSearchParams({ billingMonth })
}

function readBillSelections(value) {
  const fields = Array.isArray(value) ? value : value === undefined ? [] : [value]
  if (fields.length > MAX_GROUP_BILLS) return null
  const bills = []
  for (const field of fields) {
    if (typeof field !== 'string' || !/^[1-9]\d*:(?:0|[1-9]\d*)$/.test(field) || /\s/.test(field)) return null
    const [id, version] = field.split(':').map(readUnsignedInteger)
    bills.push({ id, version })
  }
  return bills
}

const tuitionPaymentController = {
  recordTuitionBillPayment: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.recordTuitionBillPaymentInvalidBill)
    }

    const billId = readUnsignedInteger(req.params.billId)
    const invalidInput = responses.invalidPaymentInput
    if (body.paymentMode !== undefined && body.paymentMode !== 'items') {
      return sendPageError(res, 400, invalidInput)
    }
    const rawItems = body.paymentItems ?? []
    const selectedItemIds = body.paymentMode === 'items'
      ? (Array.isArray(rawItems) ? rawItems : [rawItems]).map(readUnsignedInteger)
      : undefined

    const result = await recordTuitionBillPayment({
      billId,
      billVersion: body.billVersion === undefined ? undefined : readUnsignedInteger(body.billVersion),
      amount: readUnsignedInteger(body.amount),
      selectedItemIds,
      paidOn: body.paidOn,
      actorId: req.user.id
    })

    if (result.code === 'INVALID_INPUT') return sendPageError(res, 400, invalidInput)
    if (result.code === 'INVALID_PAYMENT_DATE') return sendPageError(res, 400, responses.recordTuitionBillPaymentInvalidPayment)
    if (result.code === 'BILL_NOT_FOUND') return sendPageError(res, 404, responses.recordTuitionBillPaymentNotFoundBill)

    const errors = responses.recordTuitionBillPaymentErrors
    let message = errors[result.code] ?? responses.recordTuitionBillPaymentUnavailableBillPayment

    if (result.ok) {
      message = result.changed
        ? responses.receivedPayment(result.receivedAmount, result.remainingAmount)
        : responses.alreadySettled
    } else if (result.code === 'PAYMENT_AMOUNT_MISMATCH') {
      message = responses.balanceChanged(result.remainingAmount)
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  recordTuitionBillRefund: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.recordTuitionBillRefundInvalidBill)
    }

    const billId = readUnsignedInteger(req.params.billId)
    const invalidInput = responses.invalidRefundInput
    const itemized = body.refundMode === 'items'
    let refundItems
    if (itemized) {
      const fields = body.refundItems ?? {}
      if (body.amount !== undefined || typeof fields !== 'object' || Array.isArray(fields)) {
        return sendPageError(res, 400, invalidInput)
      }
      refundItems = []
      for (const [key, value] of Object.entries(fields)) {
        if (!/^a[1-9]\d*$/.test(key) || typeof value !== 'string') return sendPageError(res, 400, invalidInput)
        if (value !== '') refundItems.push({ allocationId: readUnsignedInteger(key.slice(1)), amount: readUnsignedInteger(value) })
      }
    } else if (body.refundMode !== undefined || body.refundItems !== undefined) {
      return sendPageError(res, 400, invalidInput)
    }

    const result = await recordTuitionBillRefund({
      billId,
      billVersion: readUnsignedInteger(body.billVersion),
      actorId: req.user.id,
      amount: itemized ? undefined : readUnsignedInteger(body.amount),
      refundItems,
      refundedOn: body.refundedOn,
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, invalidInput)
    }
    if (result.code === 'BILL_NOT_FOUND') return sendPageError(res, 404, responses.recordTuitionBillRefundNotFoundBill)

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? responses.recordTuitionBillRefundSaved : REFUND_MESSAGES[result.code] ?? responses.recordTuitionBillRefundUnavailableBill
    )
    return res.redirect(303, `/cramschool/tuition/bills/${billId}#refund-heading`)
  },

  getTuitionPaymentGroupForm: async (req, res) => {
    const studentId = readUnsignedInteger(req.params.studentId)
    const billingMonth = req.query.billingMonth
    const result = await getStudentTuitionBillsForMonth({ studentId, billingMonth })
    if (!result.ok) return sendPageError(res, 400, responses.getTuitionPaymentGroupFormInvalidMonthStudent)

    const bills = result.rows.filter(bill => bill.canReceiveGroupedPayment).map(bill => ({
      id: bill.id,
      documentNo: getTuitionDocumentNo(bill),
      version: bill.version,
      isSupplement: bill.SupplementCourseId != null,
      courseNames: bill.courseNames.join('、'),
      remainingAmount: bill.paymentStatus.remainingAmount,
      remainingText: amountFormat.format(bill.paymentStatus.remainingAmount)
    }))
    const canSubmit = bills.length >= MIN_GROUP_BILLS
    if (canSubmit) req.session.tuitionFormToken ??= createSessionFormToken()
    const actionsBase = `/cramschool/tuition/students/${studentId}/payment-groups`

    res.set('Cache-Control', 'no-store')
    return res.render('tuition/payment-group-form', {
      studentName: formatReferenceLabel(result.student?.studentNo, result.student?.name ?? result.rows[0]?.studentNameSnapshot ?? `學生 #${studentId}`),
      billingMonth,
      bills,
      canSubmit,
      action: actionsBase,
      formToken: canSubmit ? req.session.tuitionFormToken : null,
      requestKey: canSubmit ? randomUUID() : null,
      today: getTaipeiDate(),
      minBills: MIN_GROUP_BILLS,
      maxBills: MAX_GROUP_BILLS,
      maxAmount: MAX_PAYMENT_AMOUNT,
      maxNoteLength: MAX_GROUP_NOTE_LENGTH,
      previewUrl: studentTuitionUrl(studentId, billingMonth, 'preview') + '#saved-month-bill-heading'
    })
  },

  recordTuitionPaymentGroup: async (req, res) => {
    const body = req.body ?? {}
    if (!isValidSessionFormToken(body.tuitionFormToken, req.session?.tuitionFormToken)) {
      return sendPageError(res, 403, responses.recordTuitionPaymentGroupInvalidPayment)
    }
    const bills = readBillSelections(body.billSelections)
    const studentId = readUnsignedInteger(req.params.studentId)
    const { billingMonth, paidOn, note, requestKey } = body
    const result = await tuitionPaymentGroupService.recordTuitionPaymentGroup({
      studentId, billingMonth, bills, amount: readUnsignedInteger(body.amount), paidOn, note, requestKey, actorId: req.user.id
    })
    if (result.ok) {
      req.flash('success_messages', result.created ? responses.recordTuitionPaymentGroupSavedPayment : responses.recordTuitionPaymentGroupSavedPayment2)
      return res.redirect(303, `${paymentGroupBase}/${result.paymentGroupId}`)
    }
    if (result.code === 'INVALID_INPUT') return sendPageError(res, 400, responses.recordTuitionPaymentGroupInvalidPaymentProfile)
    if (result.code === 'STUDENT_NOT_FOUND') return sendPageError(res, 404, responses.recordTuitionPaymentGroupNotFoundStudent)

    const messages = responses.recordTuitionPaymentGroupErrors
    const message = result.code === 'GROUP_AMOUNT_MISMATCH'
      ? responses.recordTuitionPaymentGroupUnavailableAmountBill(amountFormat.format(result.expectedAmount))
      : messages[result.code] ?? responses.recordTuitionPaymentGroupUnavailableBillPayment
    req.flash('error_messages', message)
    return res.redirect(303, studentTuitionUrl(studentId, billingMonth, 'payment-groups/new'))
  },

  getTuitionPaymentGroupDetails: async (req, res) => {
    const id = readUnsignedInteger(req.params.paymentGroupId)
    if (!Number.isSafeInteger(id) || id < 1) return sendPageError(res, 400, responses.getTuitionPaymentGroupDetailsInvalidPayment)

    const result = await tuitionPaymentGroupService.getTuitionPaymentGroup(id)
    if (!result) return sendPageError(res, 404, responses.getTuitionPaymentGroupDetailsNotFoundPayment)
    const { group, allocations, requiresReview } = result
    res.set('Cache-Control', 'no-store')
    return res.render('tuition/payment-group-detail', {
      group,
      amountText: Number.isSafeInteger(group.amount) && group.amount > 0 ? amountFormat.format(group.amount) : null,
      requiresReview,
      allocations: allocations.map(row => ({
        documentNo: getTuitionDocumentNo(row.TuitionBill),
        paymentId: row.id,
        isSupplement: row.TuitionBill.SupplementCourseId != null,
        amountText: amountFormat.format(row.amount),
        detailUrl: `/cramschool/tuition/bills/${row.TuitionBillId}#payment-summary-heading`
      })),
      previewUrl: studentTuitionUrl(group.StudentId, group.billingMonth, 'preview') + '#saved-month-bill-heading'
    })
  }
}

module.exports = tuitionPaymentController
