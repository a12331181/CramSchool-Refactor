const tuitionService = require('../services/tuitionService')
const { isValidSessionFormToken } = require('../utils/sessionFormToken')
const REFUND_MESSAGES = require('../constants/tuitionRefundMessages')

const paymentController = {
  recordTuitionBillPayment: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const billId = readInt(req.params.billId)
    const invalidInput = '帳單或收款資料不正確，請重新開啟帳單再試。'
    if (body.paymentMode !== undefined && body.paymentMode !== 'items') {
      return res.status(400).send(invalidInput)
    }
    const rawItems = body.paymentItems ?? []
    const selectedItemIds = body.paymentMode === 'items'
      ? (Array.isArray(rawItems) ? rawItems : [rawItems]).map(readInt)
      : undefined

    const result = await tuitionService.recordTuitionBillPayment({
      billId,
      billVersion: body.billVersion === undefined ? undefined : readInt(body.billVersion),
      amount: readInt(body.amount),
      selectedItemIds,
      paidOn: body.paidOn,
      actorId: req.user.id
    })

    if (result.code === 'INVALID_INPUT') return res.status(400).send(invalidInput)
    if (result.code === 'INVALID_PAYMENT_DATE') return res.status(400).send('請輸入有效的實際收款日，不可晚於今天。')
    if (result.code === 'BILL_NOT_FOUND') return res.status(404).send('找不到這張帳單。')

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
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value) ? Number(value) : NaN
    const billId = readInt(req.params.billId)
    const invalidInput = '帳單 ID、版本或退費金額不正確；金額須為大於零的台幣整數。'
    const itemized = body.refundMode === 'items'
    let refundItems
    if (itemized) {
      const fields = body.refundItems ?? {}
      if (body.amount !== undefined || typeof fields !== 'object' || Array.isArray(fields)) {
        return res.status(400).send(invalidInput)
      }
      refundItems = []
      for (const [key, value] of Object.entries(fields)) {
        if (!/^a[1-9]\d*$/.test(key) || typeof value !== 'string') return res.status(400).send(invalidInput)
        if (value !== '') refundItems.push({ allocationId: readInt(key.slice(1)), amount: readInt(value) })
      }
    } else if (body.refundMode !== undefined || body.refundItems !== undefined) {
      return res.status(400).send(invalidInput)
    }

    const result = await tuitionService.recordTuitionBillRefund({
      billId,
      billVersion: readInt(body.billVersion),
      actorId: req.user.id,
      amount: itemized ? undefined : readInt(body.amount),
      refundItems,
      refundedOn: body.refundedOn,
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send(invalidInput)
    }
    if (result.code === 'BILL_NOT_FOUND') return res.status(404).send('找不到這張帳單。')

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? '已登記退費。' : REFUND_MESSAGES[result.code] ?? '暫時無法登記退費，請核對帳單。'
    )
    return res.redirect(303, `/cramschool/tuition/bills/${billId}#refund-heading`)
  },
}

module.exports = paymentController