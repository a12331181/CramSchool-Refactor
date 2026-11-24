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
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }

    const billId = readUnsignedInteger(req.params.billId)
    const invalidInput = '帳單或收款資料不正確，請重新開啟帳單再試。'
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
    if (result.code === 'INVALID_PAYMENT_DATE') return sendPageError(res, 400, '請輸入有效的實際收款日，不可晚於今天。')
    if (result.code === 'BILL_NOT_FOUND') return sendPageError(res, 404, '找不到這張帳單。')

    const errors = {
      BILL_NOT_ISSUED: '只有已出帳的帳單可以登記收款。',
      BILL_NO_PAYMENT_REQUIRED: '這張帳單無須收款。',
      BILL_VERSION_CONFLICT: '帳單已更新，請核對最新的未付項目後再登記。',
      PAYMENT_ITEMS_REQUIRED: '請至少勾選一項未付明細。',
      PAYMENT_ITEMS_UNAVAILABLE: '這張帳單目前只能整筆登記剩餘金額。',
      PAYMENT_ITEMS_CHANGED: '勾選的項目已付款或不在這張帳單，請重新確認。',
      PAYMENT_ALLOCATIONS_REQUIRE_REVIEW: '分項收款紀錄需要核對，暫時不能再登記收款。',
      PAYMENT_AMOUNT_OUT_OF_RANGE: '本次收款金額超出可登記範圍，請核對勾選項目。'
    }
    let message = errors[result.code] ?? '暫時無法登記收款，請核對帳單。'

    if (result.ok) {
      message = result.changed
        ? `已登記收款 NT$ ${result.receivedAmount}，剩餘未收 NT$ ${result.remainingAmount}。`
        : '這張帳單已結清，本次未新增收款。'
    } else if (result.code === 'PAYMENT_AMOUNT_MISMATCH') {
      message = `目前未收金額為 NT$ ${result.remainingAmount}，請核對後再登記。`
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  recordTuitionBillRefund: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }

    const billId = readUnsignedInteger(req.params.billId)
    const invalidInput = '帳單 ID、版本或退費金額不正確；金額須為大於零的台幣整數。'
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
    if (result.code === 'BILL_NOT_FOUND') return sendPageError(res, 404, '找不到這張帳單。')

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? '已登記退費。' : REFUND_MESSAGES[result.code] ?? '暫時無法登記退費，請核對帳單。'
    )
    return res.redirect(303, `/cramschool/tuition/bills/${billId}#refund-heading`)
  },

  getTuitionPaymentGroupForm: async (req, res) => {
    const studentId = readUnsignedInteger(req.params.studentId)
    const billingMonth = req.query.billingMonth
    const result = await getStudentTuitionBillsForMonth({ studentId, billingMonth })
    if (!result.ok) return sendPageError(res, 400, '請選擇有效的學生及計費月份。')

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
      return sendPageError(res, 403, '表單已失效，請重新開啟合併收款頁再試。')
    }
    const bills = readBillSelections(body.billSelections)
    const studentId = readUnsignedInteger(req.params.studentId)
    const { billingMonth, paidOn, note, requestKey } = body
    const result = await tuitionPaymentGroupService.recordTuitionPaymentGroup({
      studentId, billingMonth, bills, amount: readUnsignedInteger(body.amount), paidOn, note, requestKey, actorId: req.user.id
    })
    if (result.ok) {
      req.flash('success_messages', result.created ? '已登記一筆合併收款。' : '這筆合併收款已登記，未重複新增。')
      return res.redirect(303, `${paymentGroupBase}/${result.paymentGroupId}`)
    }
    if (result.code === 'INVALID_INPUT') return sendPageError(res, 400, '收款資料不正確，請重新開啟收款頁再試。')
    if (result.code === 'STUDENT_NOT_FOUND') return sendPageError(res, 404, '找不到這位學生。')

    const messages = {
      GROUP_BILLS_REQUIRED: `請勾選至少 ${MIN_GROUP_BILLS} 張待繳帳單。只有一張時請由該帳單收款。`,
      GROUP_BILLS_UNAVAILABLE: '有帳單已無法收款，或不屬於此學生及月份。請重新核對。',
      GROUP_REQUEST_CONFLICT: '表單編號已用於另一筆登記，請重新核對。',
      BILL_NOT_ISSUED: '有帳單尚未正式出帳或已作廢，請重新核對。',
      BILL_NO_PAYMENT_REQUIRED: '有帳單已無須收款，請重新核對。',
      BILL_VERSION_CONFLICT: '有帳單已更新。這筆匯款尚未登記，請重新核對所有帳單。',
      INVALID_PAYMENT_DATE: '請輸入有效的實際收款日，不可晚於今天。',
      INVALID_GROUP_NOTE: `備註須為 ${MAX_GROUP_NOTE_LENGTH} 字元以內的文字。`,
      PAYMENT_ALLOCATIONS_REQUIRE_REVIEW: '有帳單的分項收款紀錄需要核對。',
      PAYMENT_AMOUNT_OUT_OF_RANGE: '收款金額超出可登記範圍。'
    }
    const message = result.code === 'GROUP_AMOUNT_MISMATCH'
      ? `所勾選的帳單待繳合計 NT$ ${amountFormat.format(result.expectedAmount)}。匯款金額不符，尚未登記。`
      : messages[result.code] ?? '暫時無法登記這筆收款，請先核對帳單。'
    req.flash('error_messages', message)
    return res.redirect(303, studentTuitionUrl(studentId, billingMonth, 'payment-groups/new'))
  },

  getTuitionPaymentGroupDetails: async (req, res) => {
    const id = readUnsignedInteger(req.params.paymentGroupId)
    if (!Number.isSafeInteger(id) || id < 1) return sendPageError(res, 400, '合併收款編號不正確。')

    const result = await tuitionPaymentGroupService.getTuitionPaymentGroup(id)
    if (!result) return sendPageError(res, 404, '找不到這筆合併收款。')
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
