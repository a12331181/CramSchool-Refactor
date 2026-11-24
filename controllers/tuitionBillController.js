const { sendPageError } = require('../utils/pageError')
const { MAX_EXTRA_FEE_QUANTITY } = require('../constants/extraFeeLimits')
const { formatReferenceLabel } = require('../utils/referenceLabel')
const { getTuitionDocumentNo } = require('../utils/tuitionBillReference')
const { MAX_PAYMENT_AMOUNT, MAX_REFUND_AMOUNT } = require('../constants/tuitionPayment')
const { readUnsignedInteger } = require('../utils/formNumbers')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { getTaipeiDate, formatTaipeiDateTime, isTaipeiDateKey } = require('../utils/date')
const { createSessionFormToken, isValidSessionFormToken } = require('../utils/sessionFormToken')
const REFUND_MESSAGES = require('../constants/tuitionRefundMessages')
const { buildTuitionPaymentNotice } = require('../utils/tuitionPaymentNotice')
const tuitionBillService = require('../services/tuitionBillService')
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
      return sendPageError(res, 400, '學生 ID 或計費月份不正確。')
    }

    const expectedToken = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(tuitionFormToken, expectedToken)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟合併預覽再試。')
    }

    const result = await tuitionBillService.createTuitionBillDraft({
      studentId,
      billingMonth
    })

    if (!result.ok) {
      const errors = {
        DRAFT_NUMBER_EXHAUSTED: '今年的帳單草稿編號已用完，暫時無法開單。',
        DRAFT_REQUIRES_REVIEW: '有課程還無法試算，請核對後再儲存草稿。',
        NO_COURSES_IN_BILLING_MONTH: '本月沒有可儲存的課程明細。',
        NO_UNBILLED_COURSE_FEES: '本月沒有尚未出帳的課程費用。',
        ISSUED_COURSE_FEES_REQUIRE_REVIEW: '既有帳單的課程明細需要核對。',
        INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
        UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法儲存。',
        STUDENT_NOT_FOUND: '找不到學生。',
        STUDENT_NAME_UNCONFIRMED: '請先核對學生姓名。',
        COURSE_NAME_UNCONFIRMED: '請先核對課程名稱。',
        INVALID_AMOUNT: '金額超出可儲存的範圍。'
      }

      req.flash('error_messages', errors[result.code] ?? '目前無法儲存草稿。')

      const previewUrl = `/cramschool/tuition/students/${studentId}/preview?` +
        new URLSearchParams({ billingMonth })

      return res.redirect(303, previewUrl)
    }

    req.flash(
      'success_messages',
      result.created ? '已儲存帳單草稿。' : '本月已有主帳單，已開啟原單。'
    )

    return res.redirect(303, `/cramschool/tuition/bills/${result.bill.id}`)
  },

  createSupplementalTuitionBillDraft: async (req, res) => {
    const { courseId: rawCourseId, billingMonth, tuitionFormToken, page, status } = req.body ?? {}
    if (!isValidSessionFormToken(tuitionFormToken, req.session?.tuitionFormToken)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟月度總覽再試。')
    }

    const parseId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN
    const studentId = parseId(req.params.studentId)
    const courseId = parseId(rawCourseId)
    if (![studentId, courseId].every(Number.isSafeInteger) ||
        typeof billingMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
      return sendPageError(res, 400, '學生、課程或計費月份不正確。')
    }

    const result = await tuitionBillService.createSupplementalTuitionBillDraft({
      studentId, billingMonth, courseId, actorId: req.user.id
    })
    if (!result.ok) {
      const errors = {
        SUPPLEMENT_REQUIRES_ISSUED_BILL: '本月尚未正式出帳，請先使用主帳單草稿。',
        NO_COURSES_IN_BILLING_MONTH: '這位學生本月沒有選修這門課。',
        NO_UNBILLED_COURSE_FEES: '這門課本月沒有尚未出帳的費用或堂次。',
        ISSUED_COURSE_FEES_REQUIRE_REVIEW: '既有帳單的課程明細需要核對，暫時不能補開。',
        DRAFT_NUMBER_EXHAUSTED: '今年的帳單草稿編號已用完，暫時無法開單。',
        DRAFT_REQUIRES_REVIEW: '這門課的選課或計費資料需要核對。',
        INVALID_AMOUNT: '應收金額超出可儲存的範圍。'
      }
      req.flash('error_messages', errors[result.code] ?? '目前無法補開帳單。')
      const target = withQuery(`/cramschool/tuition/students/${studentId}/preview`,
        getTuitionNavigationParams({ billingMonth, page, status }))
      return res.redirect(303, target + '#course-supplement-heading')
    }

    req.flash('success_messages', result.created ? '已建立課程補單草稿。' : '已開啟現有課程補單草稿。')
    return res.redirect(303, `/cramschool/tuition/bills/${result.bill.id}`)
  },

  getTuitionBillDetailsPage: async (req, res) => {
    const result = await tuitionBillService.getTuitionBillDetails(
      Number(req.params.billId)
    )

    if (!result.ok) {
      const invalidId = result.code === 'INVALID_BILL_ID'

      return sendPageError(res, invalidId ? 400 : 404, invalidId ? '帳單 ID 不正確。' : '找不到這張帳單。')
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
          errorMessage: creditMessages[leaveCreditData.code] ?? '暫時無法取得折抵清單。'
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
          paymentSummary.allocationMessage = '分項收款紀錄需要核對，暫時不能再登記收款。'
        } else if (remainingAmount > 0 && remainingAmount <= MAX_PAYMENT_AMOUNT) {
          req.session.tuitionFormToken ??= createSessionFormToken()
          paymentSummary.allocationMessage = allocation?.reason === 'LEGACY_UNALLOCATED_PAYMENT'
            ? '先前收款沒有記錄對應項目，剩餘金額可整筆登記。'
            : '這張帳單的明細無法拆分，剩餘金額可整筆登記。'
          paymentSummary.paymentForm = {
            action: `/cramschool/tuition/bills/${bill.id}/payments`,
            amount: remainingAmount,
            billVersion: bill.version,
            today,
            formToken: req.session.tuitionFormToken
          }
        }
      } else {
        const paymentMessages = {
          INVALID_BILL_AMOUNT: '帳單金額需要核對。',
          PAYMENT_LINK_CONFLICT: '收款同時連到新舊帳單，請核對。',
          INVALID_PAYMENT_AMOUNT: '收款紀錄的金額需要核對。',
          PAYMENT_TOTAL_EXCEEDS_BILL: '收款總額超過帳單金額，請核對。'
        }

        paymentSummary = {
          statusText: '待核對',
          errorMessage: paymentMessages[paymentStatus?.code] ?? '暫時無法確認收款資料，請重新開啟帳單。'
        }
      }
    }

    const refund = result.refundSummary
    if (refund) {
      if (!refund.ok) {
        refundSummary = { errorMessage: REFUND_MESSAGES[refund.code] ?? '暫時無法核對退費資料。' }
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
      return sendPageError(res, 400, '帳單 ID 不正確。')
    }

    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }


    const result = await tuitionBillService.addTuitionBillExtraFee({
      billId,
      extraFeeId: readUnsignedInteger(body.extraFeeId),
      quantity: readUnsignedInteger(body.quantity),
      billVersion: readUnsignedInteger(body.billVersion)
    })

    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, '找不到這張帳單。')
    }

    const errors = {
      INVALID_INPUT: `請選擇費用項目，數量須為 1 到 ${MAX_EXTRA_FEE_QUANTITY} 的整數。`,
      BILL_NOT_DRAFT: '只有草稿可以加入額外費用。',
      BILL_VERSION_CONFLICT: '帳單已更新，請核對目前明細後再試。',
      EXTRA_FEE_ALREADY_ADDED: '這個費用項目已經在帳單上。',
      EXTRA_FEE_UNAVAILABLE: '這個費用項目目前無法使用。',
      INVALID_AMOUNT: '加入後的總額超出可儲存的範圍。'
    }

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? '已加入額外費用。' : errors[result.code] ?? '無法加入額外費用。'
    )

    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  setTuitionBillDraftDiscount: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
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
      return sendPageError(res, 400, '帳單 ID 或草稿版本不正確，請重新開啟帳單再試。')
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, '找不到這張帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以修改帳單折扣。',
      BILL_VERSION_CONFLICT: '帳單已更新，請核對目前明細後再試。',
      BILL_HAS_NO_ITEMS: '草稿沒有明細，請先核對。',
      INVALID_BILL_AMOUNT: '草稿明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不符，請先核對。',
      INVALID_DISCOUNT_AMOUNT: '折扣金額須為大於 0 且在可儲存範圍內的台幣整數。',
      INVALID_DISCOUNT_REASON: '請填寫折扣原因，最多 255 字元。',
      DISCOUNT_EXCEEDS_DRAFT_TOTAL: '折扣後的應收金額不能低於 NT$ 0。',
      DISCOUNT_REQUIRES_REVIEW: '草稿裡已有需要核對的折扣明細。',
      INVALID_AMOUNT: '折扣後的總額超出可儲存範圍。'
    }
    const message = result.ok
      ? (result.changed ? '已儲存帳單折扣，請核對更新後的金額。' : '折扣沒有變動。')
      : errors[result.code] ?? '暫時無法儲存帳單折扣。'

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  addLeaveCreditToDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }


    const billId = readUnsignedInteger(req.params.billId)
    if (!Number.isSafeInteger(billId) || billId < 1) {
      return sendPageError(res, 400, '帳單 ID 不正確。')
    }

    const result = await tuitionBillService.addLeaveCreditToDraft({
      billId,
      attendId: readUnsignedInteger(body.attendId),
      billVersion: readUnsignedInteger(body.billVersion)
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, '折抵資料格式不正確，請重新開啟帳單再試。')
    }

    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, '找不到要核對的帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以加入折抵。',
      BILL_VERSION_CONFLICT: '草稿已更新，請核對目前明細後再試。',
      LEAVE_UNAVAILABLE: '找不到這筆可折抵的請假紀錄。',
      LEAVE_NOT_APPROVED: '這筆請假尚未核准，或點名更正後需要重審。',
      BILL_NOT_ISSUED: '原帳單目前不在已出帳狀態。',
      SOURCE_BILL_NOT_FOUND: '找不到上期原帳單。',
      SOURCE_BILL_AMBIGUOUS: '找到多張上期帳單，請先核對原單。',
      SOURCE_ITEM_NOT_FOUND: '原帳單沒有這堂課的計費明細。',
      SOURCE_ITEM_AMBIGUOUS: '這堂課對到多筆原明細，請先核對。',
      SOURCE_SNAPSHOT_UNCONFIRMED: '上期帳單的計費堂次需要核對。',
      SOURCE_LESSON_HAS_NO_CHARGE: '這堂課原本沒有收費。',
      SOURCE_BILL_NOT_FULLY_PAID: '原帳單尚未收清，暫時不能折抵。',
      SOURCE_BILL_HAS_REFUND: '原帳單已有退費，不能再作為請假折抵來源。',
      PAYMENT_LINK_CONFLICT: '原帳單的收款連結需要核對。',
      INVALID_PAYMENT_AMOUNT: '原帳單的收款金額需要核對。',
      PAYMENT_TOTAL_EXCEEDS_BILL: '原帳單的收款超過帳單金額，請先核對。',
      CREDIT_SOURCE_CHANGED: '折抵來源已變動，請重新核對。',
      LEAVE_CREDIT_COURSE_MISMATCH: '這份補單只能加入同一門課的請假折抵。',
      INVALID_BILL_AMOUNT: '帳單金額需要核對。',
      CREDIT_EXCEEDS_DRAFT_TOTAL: '折抵金額超過目前草稿總額。',
      LEAVE_CREDIT_VALIDATION_FAILED: '折抵明細未通過資料檢查。'
    }

    let message = errors[result.code] ?? '暫時無法加入折抵。'

    if (result.ok) {
      message = '已加入請假折抵。'
    } else if (result.code === 'LEAVE_CREDIT_ALREADY_IN_USE') {
      message = `這筆請假已由帳單 #${result.usedByBillId} 使用。`
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  issueTuitionBill: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }


    const billId = readUnsignedInteger(req.params.billId)
    if (!Number.isSafeInteger(billId) || billId < 1) {
      return sendPageError(res, 400, '帳單 ID 不正確。')
    }

    const result = await tuitionBillService.issueTuitionBill({
      billId,
      billVersion: readUnsignedInteger(body.billVersion),
      actorId: req.user.id,
      leaveCreditSkipKey: body.leaveCreditSkipKey,
      leaveCreditSkipReason: body.leaveCreditSkipReason
    })

    if (result.code === 'INVALID_INPUT') {
      return sendPageError(res, 400, '出帳資料格式不正確，請重新開啟帳單再試。')
    }

    if (result.code === 'BILL_NOT_FOUND') {
      return sendPageError(res, 404, '找不到這張帳單。')
    }

    const errors = {
      BILL_NUMBER_EXHAUSTED: '今年的正式帳單編號已用完，暫時無法出帳。',
      BILL_NOT_DRAFT: '只有草稿可以正式出帳。',
      BILL_VERSION_CONFLICT: '草稿已更新，請核對目前明細後再出帳。',
      BILL_HAS_NO_ITEMS: '帳單沒有明細，暫時不能出帳。',
      INVALID_BILL_AMOUNT: '帳單明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不一致，請先核對。',
      DRAFT_COURSE_FEES_REQUIRE_REVIEW: '草稿的課程明細已變動或無法核對，請更新草稿後再試。',
      NO_UNBILLED_COURSE_FEES: '本張課程費已出帳或不再適用，請核對後捨棄草稿。',
      SUPPLEMENT_REQUIRES_ISSUED_BILL: '本月已無正式帳單，請先核對主帳單。',
      DISCOUNT_REQUIRES_REVIEW: '草稿裡有帳單折扣需要核對，暫時不能出帳。',
      LEAVE_REVIEW_UNAVAILABLE: '目前無法核對上月請假，暫時不能出帳。',
      LEAVE_CREDIT_REQUIRES_REVIEW: '草稿裡有折抵需要重新核對，暫時不能出帳。',
      LEAVE_CREDIT_OPTIONS_CHANGED: '可折抵項目已變更，請核對重新載入的明細後再出帳。',
      INVALID_LEAVE_CREDIT_SKIP_REASON: '請填寫本張帳單不折抵的原因，最多 255 字元。'
    }

    let message = errors[result.code] ?? '暫時無法正式出帳。'

    if (result.ok) {
      message = result.changed ? '已正式出帳。' : '這張帳單已經出帳。'
    } else if (result.code === 'PENDING_LEAVE_REVIEWS') {
      message = `上月還有 ${result.pendingCount} 筆請假待審核，請回到合併預覽處理後再出帳。`
    } else if (result.code === 'UNAPPLIED_LEAVE_CREDITS') {
      message = `還有 ${result.creditCount} 筆可加入的請假折抵，請加入折抵或確認本張不折抵後再出帳。`
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  refreshTuitionBillDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }


    const billId = readUnsignedInteger(req.params.billId)
    const billVersion = readUnsignedInteger(body.billVersion)
    const invalidInput = '帳單 ID 或草稿版本不正確，請重新開啟帳單再試。'

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
      return sendPageError(res, 404, '找不到這張帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以更新課程明細。',
      BILL_VERSION_CONFLICT: '草稿已變更，請核對重新載入的帳單後再試。',
      STUDENT_NOT_FOUND: '找不到學生資料，無法更新草稿。',
      BILL_HAS_NO_ITEMS: '草稿沒有明細，請先核對。',
      INVALID_BILL_AMOUNT: '草稿明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不符，請先核對。',
      INVALID_BILLING_MONTH: '帳單的計費月份需要核對。',
      UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法更新。',
      DRAFT_REQUIRES_REVIEW: '仍有課程資料待核對，請回到月度總覽確認。',
      NO_UNBILLED_COURSE_FEES: '已無未計費的課程費，請核對後捨棄草稿。',
      ISSUED_COURSE_FEES_REQUIRE_REVIEW: '既有帳單的課程明細需要核對。',
      SUPPLEMENT_REQUIRES_ISSUED_BILL: '本月已無正式帳單，請先核對主帳單。',
      NO_COURSES_IN_BILLING_MONTH: '本月沒有可建立明細的課程，草稿未更新。',
      COURSE_NAME_UNCONFIRMED: '課程名稱需要核對，草稿未更新。',
      INVALID_AMOUNT: '更新後的金額超出可儲存範圍，草稿未更新。',
      DRAFT_CREDITS_EXCEED_UPDATED_TOTAL: '更新後的金額不足以扣除原有折抵或折扣，草稿未更新。'
    }

    const message = result.ok
      ? (result.changed ? '已更新課程明細，請核對金額後再出帳。' : '課程明細沒有變動，草稿維持原樣。')
      : errors[result.code] ?? '暫時無法更新草稿。'

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  removeTuitionBillDraftAdjustment: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }


    const billId = readUnsignedInteger(req.params.billId)
    const billItemId = readUnsignedInteger(req.params.billItemId)
    const billVersion = readUnsignedInteger(body.billVersion)
    const invalidInput = '帳單、明細 ID 或草稿版本不正確，請重新開啟帳單再試。'

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
      return sendPageError(res, 404, '找不到這張帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以移除額外費用、折抵或折扣。',
      BILL_VERSION_CONFLICT: '草稿已變更，請核對重新載入的帳單後再試。',
      BILL_ITEM_NOT_FOUND: '找不到這張帳單的該筆明細，可能已經移除。',
      BILL_ITEM_NOT_REMOVABLE: '只能移除額外費用、請假折抵或帳單折扣。課程費用請使用「更新草稿」。',
      INVALID_BILL_AMOUNT: '草稿明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不符，請先核對。',
      INVALID_AMOUNT: '移除後的金額超出可儲存範圍，草稿未變更。',
      DRAFT_CREDITS_EXCEED_UPDATED_TOTAL: '移除後的金額不足以扣除原有折抵或折扣，草稿未變更。'
    }

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? '已移除這筆明細，請核對更新後的金額。' : errors[result.code] ?? '暫時無法移除明細。'
    )
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  discardTuitionBillDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }


    const billId = readUnsignedInteger(req.params.billId)
    const billVersion = readUnsignedInteger(body.billVersion)
    const invalidInput = '帳單 ID 或草稿版本不正確，請重新開啟帳單再試。'

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
      return sendPageError(res, 404, '找不到這張帳單。')
    }

    const errors = {
      INVALID_DISCARD_REASON: '請填寫捨棄草稿的原因，最多 255 字元。',
      BILL_NOT_DRAFT: '只有尚未出帳的草稿可以捨棄。',
      BILL_VERSION_CONFLICT: '草稿已變更，請核對重新載入的帳單後再試。',
      DRAFT_HAS_PAYMENT: '這張草稿已有收款紀錄，請先核對。草稿未捨棄。',
      LEAVE_CREDIT_REQUIRES_REVIEW: '有請假折抵來源需要核對，草稿未捨棄。'
    }

    const message = result.ok
      ? (result.changed ? '已捨棄草稿，原帳單紀錄已保留。' : '這張草稿已經捨棄，沒有重複處理。')
      : errors[result.code] ?? '暫時無法捨棄草稿。'

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  voidIssuedTuitionBill: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, '表單已失效，請重新開啟帳單再試。')
    }


    const billId = readUnsignedInteger(req.params.billId)
    const billVersion = readUnsignedInteger(body.billVersion)
    const invalidInput = '帳單 ID 或版本不正確，請重新開啟帳單再試。'

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
    if (result.code === 'BILL_NOT_FOUND') return sendPageError(res, 404, '找不到這張帳單。')

    const errors = {
      INVALID_VOID_REASON: '請填寫作廢原因，最多 255 字元。',
      BILL_NOT_ISSUED: '這張帳單目前無法作廢，請核對帳單狀態。',
      BILL_VERSION_CONFLICT: '帳單已變更，請核對重新載入的明細後再試。',
      BILL_HAS_PAYMENT: '這張帳單已有收款紀錄，帳單未作廢。',
      LEAVE_CREDIT_REQUIRES_REVIEW: '有請假折抵來源需要核對，帳單未作廢。'
    }

    const message = result.ok
      ? (result.changed ? '已作廢帳單，原明細已保留。' : '這張帳單已作廢，本次沒有重複處理。')
      : errors[result.code] ?? '暫時無法作廢帳單。'

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  }
}

module.exports = tuitionBillController
