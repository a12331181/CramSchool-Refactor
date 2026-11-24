// 處理草稿、費用明細、折抵、出帳與帳單檢視。

const { MAX_EXTRA_FEE_QUANTITY } = require('../constants/extraFeeLimits')
const responses = require('../constants/messages/tuitionBill')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { MAX_PAYMENT_AMOUNT, MAX_REFUND_AMOUNT } = require('../constants/tuitionPayment')
const REFUND_MESSAGES = require('../constants/tuitionRefundMessages')

const tuitionBillService = require('../services/tuitionBillService')

const { getTaipeiDate, formatTaipeiDateTime, isTaipeiDateKey } = require('../utils/date')
const { readUnsignedInteger } = require('../utils/formNumbers')
const { sendPageError } = require('../utils/pageError')
const { formatReferenceLabel } = require('../utils/referenceLabel')
const { createSessionFormToken, isValidSessionFormToken } = require('../utils/sessionFormToken')
const { getTuitionDocumentNo } = require('../utils/tuitionBillReference')
const { buildTuitionPaymentNotice } = require('../utils/tuitionPaymentNotice')
const { getTuitionNavigationParams, withQuery, getTuitionBillPaymentStatusText } = require('../utils/tuitionViewData.js')

function describeTuitionBillChange({ before, after }) {
  const hasTotal = Number.isSafeInteger(after?.totalAmount)
  const amountText = hasTotal ? `帳單金額 NT$ ${after.totalAmount}` : '—'

  if (!before && after?.status === TUITION_BILL_STATUS.DRAFT && Number.isSafeInteger(after.courseId)) {
    return { actionText: '建立課程補單草稿', detailText: amountText }
  }

  if (before?.status === TUITION_BILL_STATUS.DRAFT && after?.status === TUITION_BILL_STATUS.ISSUED) {
    const skippedCount = Array.isArray(after.skippedLeaveCredits) ? after.skippedLeaveCredits.length : 0
    return {
      actionText: '正式出帳',
      detailText: skippedCount > 0 ? `${amountText}｜本張未折抵 ${skippedCount} 筆請假` : amountText
    }
  }

  if (after?.status === TUITION_BILL_STATUS.VOID && [TUITION_BILL_STATUS.DRAFT, TUITION_BILL_STATUS.ISSUED].includes(before?.status)) {
    const releasedCount = Array.isArray(before.activeLeaveCredits) ? before.activeLeaveCredits.length : 0
    return {
      actionText: before.status === TUITION_BILL_STATUS.DRAFT ? '捨棄草稿' : '作廢帳單',
      detailText: releasedCount > 0 ? `保留原明細，釋放 ${releasedCount} 筆請假折抵` : '保留原明細'
    }
  }

  if (Number.isSafeInteger(after?.refundId) && Number.isSafeInteger(after?.refundAmount)) {
    return {
      actionText: '登記退費',
      detailText: `${after.refundedOn}｜NT$ ${after.refundAmount}（退費 #${after.refundId}）`
    }
  }

  if (Number.isSafeInteger(after?.paymentId) && Number.isSafeInteger(after?.receivedAmount)) {
    const items = Number.isSafeInteger(after.allocatedItemCount)
      ? `，${after.allocatedItemCount} 項明細`
      : ''
    return {
      actionText: '登記收款',
      detailText: `${isTaipeiDateKey(after.paidOn) ? after.paidOn + '｜' : ''}NT$ ${after.receivedAmount}（收款 #${after.paymentId}${items}）`
    }
  }

  const amountChange = hasTotal && Number.isSafeInteger(before?.totalAmount) && before.totalAmount !== after.totalAmount
    ? `帳單金額 NT$ ${before.totalAmount} → NT$ ${after.totalAmount}`
    : amountText

  if (Number.isSafeInteger(after?.discount?.amount)) {
    const previous = before?.discount?.amount
    const next = after.discount.amount
    const discountText = Number.isSafeInteger(previous) && previous !== next
      ? `折扣 NT$ ${previous} → NT$ ${next}`
      : `折扣 NT$ ${next}`
    return {
      actionText: before?.discount ? '修改帳單折扣' : '加入帳單折扣',
      detailText: `${discountText}｜${amountChange}`
    }
  }

  if (Number.isSafeInteger(after?.removedBillItemId)) {
    const { kind, descriptionSnapshot } = before?.item ?? {}
    const labels = { [TUITION_BILL_ITEM_KIND.LEAVE_CREDIT]: '移除請假折抵', [TUITION_BILL_ITEM_KIND.EXTRA_FEE]: '移除額外費用', [TUITION_BILL_ITEM_KIND.DISCOUNT]: '移除帳單折扣' }
    return {
      actionText: labels[kind] ?? '移除明細',
      detailText: descriptionSnapshot ? `${descriptionSnapshot}｜${amountChange}` : amountChange
    }
  }

  return {
    actionText: Array.isArray(after?.courseFees) ? '更新草稿' : '帳單異動',
    detailText: amountChange
  }
}

function buildTuitionBillHistory({ logs, actors, limit }) {
  const actorNames = new Map(actors.map(actor => {
    const name = actor.name?.trim() || '未設定名稱'
    const account = actor.userNo || `帳號 #${actor.id}`
    return [actor.id, `${account}｜${name}`]
  }))

  return {
    limit,
    rows: logs.map(log => ({
      ...describeTuitionBillChange(log),
      occurredAtText: formatTaipeiDateTime(log.occurredAt) ?? '待核對',
      actorText: actorNames.get(log.actorId) ?? `帳號 #${log.actorId}`,
      reason: log.reason?.trim() || '—'
    }))
  }
}

const tuitionBillController = {
  createTuitionBillDraft: async (req, res) => {
    const studentId = Number(req.params.studentId)
    const { billingMonth, tuitionFormToken } = req.body ?? {}

    if (
      !Number.isSafeInteger(studentId) ||
      studentId < 1 ||
      typeof billingMonth !== 'string' ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)
    ) {
      return sendPageError(res, 400, responses.createTuitionBillDraftInvalidMonthStudent)
    }

    const expectedToken = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(tuitionFormToken, expectedToken)) {
      return sendPageError(res, 403, responses.createTuitionBillDraftInvalid)
    }

    const result = await tuitionBillService.createTuitionBillDraft({
      studentId,
      billingMonth
    })

    if (!result.ok) {
      const errors = responses.createTuitionBillDraftErrors

      req.flash('error_messages', errors[result.code] ?? responses.createTuitionBillDraftUnavailable)

      const previewUrl = `/cramschool/tuition/students/${studentId}/preview?` +
        new URLSearchParams({ billingMonth })

      return res.redirect(303, previewUrl)
    }

    req.flash(
      'success_messages',
      result.created ? responses.createTuitionBillDraftSavedBill : responses.createTuitionBillDraftUnchangedBill
    )

    return res.redirect(303, `/cramschool/tuition/bills/${result.bill.id}`)
  },

  createSupplementalTuitionBillDraft: async (req, res) => {
    const { courseId: rawCourseId, billingMonth, tuitionFormToken, page, status } = req.body ?? {}
    if (!isValidSessionFormToken(tuitionFormToken, req.session?.tuitionFormToken)) {
      return sendPageError(res, 403, responses.createSupplementalTuitionBillDraftInvalid)
    }

    const parseId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN
    const studentId = parseId(req.params.studentId)
    const courseId = parseId(rawCourseId)
    if (![studentId, courseId].every(Number.isSafeInteger) ||
        typeof billingMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
      return sendPageError(res, 400, responses.createSupplementalTuitionBillDraftInvalidMonthStudentCourse)
    }

    const result = await tuitionBillService.createSupplementalTuitionBillDraft({
      studentId, billingMonth, courseId, actorId: req.user.id
    })
    if (!result.ok) {
      const errors = responses.createSupplementalTuitionBillDraftErrors
      req.flash('error_messages', errors[result.code] ?? responses.createSupplementalTuitionBillDraftUnavailableBill)
      const target = withQuery(`/cramschool/tuition/students/${studentId}/preview`,
        getTuitionNavigationParams({ billingMonth, page, status }))
      return res.redirect(303, target + '#course-supplement-heading')
    }

    req.flash('success_messages', result.created ? responses.createSupplementalTuitionBillDraftSavedCourseSupplement : responses.createSupplementalTuitionBillDraftMessageCourseSupplement)
    return res.redirect(303, `/cramschool/tuition/bills/${result.bill.id}`)
  },

  getTuitionBillDetailsPage: async (req, res) => {
    const result = await tuitionBillService.getTuitionBillDetails(
      Number(req.params.billId)
    )

    if (!result.ok) {
      const invalidId = result.code === 'INVALID_BILL_ID'

      return sendPageError(res, invalidId ? 400 : 404, invalidId ? responses.getTuitionBillDetailsPageInvalidBill : responses.getTuitionBillDetailsPageNotFoundBill)
    }

    const { bill, extraFees, leaveCreditData, canVoidIssuedBill } = result
    const isDraft = bill.status === TUITION_BILL_STATUS.DRAFT
    const hasExtraFeeForm = isDraft && extraFees.length > 0
    const hasLeaveCreditForm = isDraft && leaveCreditData?.ok === true && leaveCreditData.options.length > 0

    if (isDraft || canVoidIssuedBill) {
      req.session.tuitionFormToken ??= createSessionFormToken()
    }

    const extraFeeFormToken = hasExtraFeeForm ? req.session.tuitionFormToken : null

    const discount = bill.items.find(item => item.kind === TUITION_BILL_ITEM_KIND.DISCOUNT)
    const discountForm = isDraft && (bill.totalAmount > 0 || discount)
      ? {
          amount: discount?.unitPrice,
          reason: discount?.reason,
          formToken: req.session.tuitionFormToken
        }
      : null

    const issueForm = isDraft
      ? {
          action: `/cramschool/tuition/bills/${bill.id}/issue`,
          billVersion: bill.version,
          formToken: req.session.tuitionFormToken,
          unappliedCreditCount: hasLeaveCreditForm ? leaveCreditData.options.length : 0,
          leaveCreditSkipKey: hasLeaveCreditForm ? leaveCreditData.optionKey : null
        }
      : null

    const voidForm = canVoidIssuedBill
      ? {
          action: `/cramschool/tuition/bills/${bill.id}/void`,
          billVersion: bill.version,
          formToken: req.session.tuitionFormToken
        }
      : null

    const creditMessages = {
      UTC_REQUIRED: '系統時間設定異常，暫時無法取得折抵。',
      INVALID_BILL_AMOUNT: '草稿金額需要核對。',
      SOURCE_BILL_NOT_FOUND: '找不到上期帳單。',
      BILL_NOT_ISSUED: '原帳單目前不在已出帳狀態。',
      SOURCE_BILL_NOT_FULLY_PAID: '原帳單尚未收清。',
      SOURCE_BILL_HAS_REFUND: '原帳單已有退費，不能再作為請假折抵來源。',
      SOURCE_ITEM_NOT_FOUND: '原帳單沒有這堂課的計費明細。',
      SOURCE_SNAPSHOT_UNCONFIRMED: '原帳單的計費堂次需要核對。',
      SOURCE_LESSON_HAS_NO_CHARGE: '這堂課原本沒有收費。',
      LEAVE_NOT_APPROVED: '請假審核結果已變動，請重新核對。',
      CREDIT_EXCEEDS_DRAFT_TOTAL: '折抵金額超過目前草稿總額。'
    }

    let leaveCreditPanel = null

    if (isDraft && leaveCreditData) {
      if (!leaveCreditData.ok) {
        leaveCreditPanel = {
          errorMessage: creditMessages[leaveCreditData.code] ?? responses.getTuitionBillDetailsPageUnavailable
        }
      } else {
        const blocked = leaveCreditData.blocked.map(row => {
          let statusText = creditMessages[row.code] ?? '請核對原帳單或收款資料。'

          if (row.code === 'LEAVE_CREDIT_ALREADY_IN_USE') {
            statusText = row.usedByBillId === bill.id
              ? '已加入本張草稿。'
              : `已由帳單 #${row.usedByBillId} 使用。`
          }

          return { ...row, statusText }
        })

        leaveCreditPanel = {
          ...leaveCreditData,
          blocked,
          billVersion: bill.version,
          formToken: hasLeaveCreditForm ? req.session.tuitionFormToken : null,
          action: `/cramschool/tuition/bills/${bill.id}/leave-credits`
        }
      }
    }
    const labels = { [TUITION_BILL_STATUS.DRAFT]: '草稿', [TUITION_BILL_STATUS.ISSUED]: '已發單', [TUITION_BILL_STATUS.VOID]: '已作廢' }

    const items = bill.items.map(({ id, kind, descriptionSnapshot, quantity, unitPrice, amount, reason, sourceSnapshot, Course }) => ({
      id, quantity, unitPrice, amount, reason,
      label: formatReferenceLabel(Course?.courseNo, descriptionSnapshot),
      canRemove: isDraft && [
        TUITION_BILL_ITEM_KIND.EXTRA_FEE, TUITION_BILL_ITEM_KIND.LEAVE_CREDIT, TUITION_BILL_ITEM_KIND.DISCOUNT
      ].includes(kind),
      reviewCount: Array.isArray(sourceSnapshot?.reviewItems) ? sourceSnapshot.reviewItems.length : 0
    }))

    const previewUrl = `/cramschool/tuition/students/${bill.StudentId}/preview?` +
      new URLSearchParams({ billingMonth: bill.billingMonth })

    let paymentSummary = null
    let refundSummary = null

    if (bill.status === TUITION_BILL_STATUS.ISSUED) {
      const paymentStatus = result.paymentStatus

      if (paymentStatus?.ok === true) {
        const { totalAmount, paidAmount, remainingAmount } = paymentStatus
        const statusText = getTuitionBillPaymentStatusText(paymentStatus)

        const today = getTaipeiDate()
        const paymentRows = result.payments.map(({ id, time, amount, TuitionPaymentGroupId }) => ({
          id, amount, paidOn: isTaipeiDateKey(time) ? time : null,
          paymentGroupId: TuitionPaymentGroupId,
          paymentGroupUrl: TuitionPaymentGroupId
            ? `/cramschool/tuition/payment-groups/${TuitionPaymentGroupId}`
            : null
        })).sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? '') || b.id - a.id)
        paymentSummary = { totalAmount, paidAmount, remainingAmount, statusText, paymentRows }
        const allocation = result.paymentAllocation
        if (allocation?.ok && allocation.itemized) {
          const canRecord = remainingAmount > 0
          if (canRecord) req.session.tuitionFormToken ??= createSessionFormToken()
          const courseNumbersByItem = new Map(bill.items.map(item => [item.id, item.Course?.courseNo]))
          paymentSummary.itemizedPayment = {
            canRecord,
            action: `/cramschool/tuition/bills/${bill.id}/payments`,
            formToken: canRecord ? req.session.tuitionFormToken : null,
            maxAmount: MAX_PAYMENT_AMOUNT,
            billVersion: bill.version,
            today,
            hasAdjustments: allocation.hasAdjustments,
            items: allocation.items.map(item => ({
              ...item,
              description: formatReferenceLabel(courseNumbersByItem.get(item.itemId), item.description),
              canSelect: canRecord && item.amount > 0 && item.paymentId === null,
              statusText: item.paymentId !== null ? `已收款（#${item.paymentId}）`
                : item.amount === 0 ? '已折抵' : '未收款'
            }))
          }
        } else if (allocation?.ok === false) {
          paymentSummary.allocationMessage = responses.allocationReview
        } else if (remainingAmount > 0 && remainingAmount <= MAX_PAYMENT_AMOUNT) {
          req.session.tuitionFormToken ??= createSessionFormToken()
          paymentSummary.allocationMessage = allocation?.reason === 'LEGACY_UNALLOCATED_PAYMENT'
            ? responses.unallocatedPayment
            : responses.unallocatedBill
          paymentSummary.paymentForm = {
            action: `/cramschool/tuition/bills/${bill.id}/payments`,
            amount: remainingAmount,
            billVersion: bill.version,
            today,
            formToken: req.session.tuitionFormToken
          }
        }
      } else {
        const paymentMessages = responses.financialReview

        paymentSummary = {
          statusText: '待核對',
          errorMessage: paymentMessages[paymentStatus?.code] ?? responses.getTuitionBillDetailsPageUnavailableBillPaymentProfile
        }
      }
    }

    const refund = result.refundSummary
    if (refund) {
      if (!refund.ok) {
        refundSummary = { errorMessage: REFUND_MESSAGES[refund.code] ?? responses.getTuitionBillDetailsPageUnavailableProfile }
      } else {
        refundSummary = {
          rows: refund.rows,
          refundedAmount: refund.refundedAmount,
          netPaidAmount: refund.netPaidAmount,
          blockedMessage: REFUND_MESSAGES[refund.blockedCode],
          statusText: refund.refundedAmount === 0
            ? '尚未退費'
            : refund.netPaidAmount === 0 ? '已全額退費' : '已部分退費'
        }
        if (refund.netPaidAmount > 0 && !refund.blockedCode) {
          req.session.tuitionFormToken ??= createSessionFormToken()
          refundSummary.form = {
            action: `/cramschool/tuition/bills/${bill.id}/refunds`,
            formToken: req.session.tuitionFormToken,
            billVersion: bill.version,
            itemized: refund.mode === 'items',
            items: refund.items.filter(item => item.remainingAmount > 0).map(item => ({
              ...item,
              maxAmount: Math.min(item.remainingAmount, MAX_REFUND_AMOUNT)
            })),
            maxAmount: Math.min(refund.netPaidAmount, MAX_REFUND_AMOUNT),
            earliestDate: result.paymentStatus.lastPaidOn,
            today: getTaipeiDate()
          }
        }
      }
    }

    res.set('Cache-Control', 'no-store')

    return res.render('tuition/bill-detail', {
      bill,
      documentNo: getTuitionDocumentNo(bill),
      items,
      statusText: labels[bill.status] ?? '待核對',
      paymentSummary,
      refundSummary,
      paymentNotice: buildTuitionPaymentNotice(bill, result.paymentStatus, refund),
      billHistory: buildTuitionBillHistory(result.history),
      previewUrl,
      isDraft, 
      discountForm,
      leaveCreditPanel,
      issueForm,
      voidForm,
      extraFees, 
      maxExtraFeeQuantity: MAX_EXTRA_FEE_QUANTITY,
      extraFeeFormToken
    })
  },

  addTuitionBillExtraFee: async (req, res) => {
    const billId = Number(req.params.billId)
    if (!Number.isSafeInteger(billId) || billId < 1) {
      return sendPageError(res, 400, responses.addTuitionBillExtraFeeInvalidBill)
    }

    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.addTuitionBillExtraFeeInvalidBill2)
    }


    const result = await tuitionBillService.addTuitionBillExtraFee({
      billId,
      extraFeeId: readUnsignedInteger(body.extraFeeId),
      quantity: readUnsignedInteger(body.quantity),
      billVersion: readUnsignedInteger(body.billVersion)
    })

    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, responses.addTuitionBillExtraFeeNotFoundBill)
    }

    const errors = responses.addTuitionBillExtraFeeErrors

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? responses.addTuitionBillExtraFeeMessage : errors[result.code] ?? responses.addTuitionBillExtraFeeUnavailable
    )

    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  setTuitionBillDraftDiscount: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.setTuitionBillDraftDiscountInvalidBill)
    }

    const billId = readUnsignedInteger(req.params.billId)
    const result = await tuitionBillService.setTuitionBillDraftDiscount({
      billId,
      billVersion: readUnsignedInteger(body.billVersion),
      actorId: req.user.id,
      amount: readUnsignedInteger(body.amount),
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, responses.setTuitionBillDraftDiscountInvalidBillVersion)
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, responses.setTuitionBillDraftDiscountNotFoundBill)
    }

    const errors = responses.setTuitionBillDraftDiscountErrors
    const message = result.ok
      ? (result.changed ? responses.setTuitionBillDraftDiscountSavedAmountDiscountBill : responses.setTuitionBillDraftDiscountMessageDiscount)
      : errors[result.code] ?? responses.setTuitionBillDraftDiscountUnavailableDiscountBill

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  addLeaveCreditToDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.addLeaveCreditToDraftInvalidBill)
    }


    const billId = readUnsignedInteger(req.params.billId)
    if (!Number.isSafeInteger(billId) || billId < 1) {
      return sendPageError(res, 400, responses.addLeaveCreditToDraftInvalidBill2)
    }

    const result = await tuitionBillService.addLeaveCreditToDraft({
      billId,
      attendId: readUnsignedInteger(body.attendId),
      billVersion: readUnsignedInteger(body.billVersion)
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, responses.addLeaveCreditToDraftInvalidBillProfile)
    }

    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, responses.addLeaveCreditToDraftNotFoundBill)
    }

    const errors = responses.addLeaveCreditToDraftErrors

    let message = errors[result.code] ?? responses.addLeaveCreditToDraftUnavailable

    if (result.ok) {
      message = responses.leaveCreditAdded
    } else if (result.code === 'LEAVE_CREDIT_ALREADY_IN_USE') {
      message = responses.leaveCreditUsed(result.usedByBillId)
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  issueTuitionBill: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.issueTuitionBillInvalidBill)
    }


    const billId = readUnsignedInteger(req.params.billId)
    if (!Number.isSafeInteger(billId) || billId < 1) {
      return sendPageError(res, 400, responses.issueTuitionBillInvalidBill2)
    }

    const result = await tuitionBillService.issueTuitionBill({
      billId,
      billVersion: readUnsignedInteger(body.billVersion),
      actorId: req.user.id,
      leaveCreditSkipKey: body.leaveCreditSkipKey,
      leaveCreditSkipReason: body.leaveCreditSkipReason
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, responses.issueTuitionBillInvalidBillProfile)
    }

    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, responses.issueTuitionBillNotFoundBill)
    }

    const errors = responses.issueTuitionBillErrors

    let message = errors[result.code] ?? responses.issueTuitionBillUnavailable

    if (result.ok) {
      message = result.changed ? responses.issued : responses.alreadyIssued
    } else if (result.code === 'PENDING_LEAVE_REVIEWS') {
      message = responses.pendingLeaveApproval(result.pendingCount)
    } else if (result.code === 'UNAPPLIED_LEAVE_CREDITS') {
      message = responses.pendingLeaveCredit(result.creditCount)
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  refreshTuitionBillDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.refreshTuitionBillDraft_invalidBill)
    }


    const billId = readUnsignedInteger(req.params.billId)
    const billVersion = readUnsignedInteger(body.billVersion)
    const invalidInput = responses.invalidDraftVersion

    if (
      !Number.isSafeInteger(billId) || billId < 1 ||
      !Number.isSafeInteger(billVersion) || billVersion < 0
    ) {
      return sendPageError(res, 400, invalidInput)
    }

    const result = await tuitionBillService.refreshTuitionBillDraft({
      billId,
      billVersion,
      actorId: req.user.id
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, invalidInput)
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, responses.refreshTuitionBillDraft_notFoundBill)
    }

    const errors = responses.refreshTuitionBillDraft_errors

    const message = result.ok
      ? (result.changed ? responses.refreshTuitionBillDraft_savedAmountCourse : responses.refreshTuitionBillDraft_messageCourse)
      : errors[result.code] ?? responses.refreshTuitionBillDraft_unavailable

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  removeTuitionBillDraftAdjustment: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.removeTuitionBillDraftAdjustmentInvalidBill)
    }


    const billId = readUnsignedInteger(req.params.billId)
    const billItemId = readUnsignedInteger(req.params.billItemId)
    const billVersion = readUnsignedInteger(body.billVersion)
    const invalidInput = responses.invalidItemVersion

    if (
      ![billId, billItemId].every(id => Number.isSafeInteger(id) && id > 0) ||
      !Number.isSafeInteger(billVersion) || billVersion < 0
    ) {
      return sendPageError(res, 400, invalidInput)
    }

    const result = await tuitionBillService.removeTuitionBillDraftAdjustment({
      billId,
      billItemId,
      billVersion,
      actorId: req.user.id
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, invalidInput)
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, responses.removeTuitionBillDraftAdjustmentNotFoundBill)
    }

    const errors = responses.removeTuitionBillDraftAdjustmentErrors

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? responses.removeTuitionBillDraftAdjustmentInvalidAmount : errors[result.code] ?? responses.removeTuitionBillDraftAdjustmentUnavailable
    )
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  discardTuitionBillDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.discardTuitionBillDraft_invalidBill)
    }


    const billId = readUnsignedInteger(req.params.billId)
    const billVersion = readUnsignedInteger(body.billVersion)
    const invalidInput = responses.invalidDraftVersion

    if (
      !Number.isSafeInteger(billId) || billId < 1 ||
      !Number.isSafeInteger(billVersion) || billVersion < 0
    ) {
      return sendPageError(res, 400, invalidInput)
    }

    const result = await tuitionBillService.discardTuitionBillDraft({
      billId,
      billVersion,
      actorId: req.user.id,
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, invalidInput)
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, responses.discardTuitionBillDraft_notFoundBill)
    }

    const errors = responses.discardTuitionBillDraft_errors

    const message = result.ok
      ? (result.changed ? responses.discardTuitionBillDraft_messageBillRecord : responses.discardTuitionBillDraft_unchanged)
      : errors[result.code] ?? responses.discardTuitionBillDraft_unavailable

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  voidIssuedTuitionBill: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.voidIssuedTuitionBillInvalidBill)
    }


    const billId = readUnsignedInteger(req.params.billId)
    const billVersion = readUnsignedInteger(body.billVersion)
    const invalidInput = responses.invalidBillVersion

    if (
      !Number.isSafeInteger(billId) || billId < 1 ||
      !Number.isSafeInteger(billVersion) || billVersion < 0
    ) {
      return sendPageError(res, 400, invalidInput)
    }

    const result = await tuitionBillService.voidIssuedTuitionBill({
      billId,
      billVersion,
      actorId: req.user.id,
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') return sendPageError(res, 400, invalidInput)
    if (result.code === 'BILL_NOT_FOUND') return sendPageError(res, 404, responses.voidIssuedTuitionBillNotFoundBill)

    const errors = responses.voidIssuedTuitionBillErrors

    const message = result.ok
      ? (result.changed ? responses.voidIssuedTuitionBillMessageBill : responses.voidIssuedTuitionBillUnchangedBill)
      : errors[result.code] ?? responses.voidIssuedTuitionBillUnavailableBill

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  }
}

module.exports = tuitionBillController
