const db = require('../models')
const Payment = db.Payment
const Tuition = db.Tuition
const FeeList = db.FeeList
const tuitionService = require('../services/tuitionService')
const { timingSafeEqual } = require('node:crypto')
const REFUND_MESSAGES = require('../constants/tuitionRefundMessages')

const paymentController = {
  recordTuitionBillPayment: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
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
      actorId: req.user.id
    })

    if (result.code === 'INVALID_INPUT') return res.status(400).send(invalidInput)
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
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)
    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value) ? Number(value) : NaN
    const billId = readInt(req.params.billId)
    const result = await tuitionService.recordTuitionBillRefund({
      billId,
      billVersion: readInt(body.billVersion),
      actorId: req.user.id,
      amount: readInt(body.amount),
      refundedOn: body.refundedOn,
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send('帳單 ID、版本或退費金額不正確；金額須為大於零的台幣整數。')
    }
    if (result.code === 'BILL_NOT_FOUND') return res.status(404).send('找不到這張帳單。')

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? '已登記退費。' : REFUND_MESSAGES[result.code] ?? '暫時無法登記退費，請核對帳單。'
    )
    return res.redirect(303, `/cramschool/tuition/bills/${billId}#refund-heading`)
  },

  deletePayment: (req, res) => {
    Payment.findByPk(req.params.id,{
      include: [{ model: Tuition, required: true }]
    }).then(payment => {
      Tuition.findByPk(payment.dataValues.Tuition.id).then(tuition => {
        Promise.all([
          FeeList.destroy({
            where: { TuitionId: tuition.dataValues.id }
          }),
          tuition.destroy(),
          payment.destroy()
        ]).then(() => {
          if (!payment) {
            return res.status(404).send('找不到可操作的舊制收款紀錄。')
          }
          req.flash('success_messages', '已成功刪除收費紀錄與費用表')
          res.redirect('/cramschool/payment')
        })
      })
    })
  },

  paymentPaid: (req, res) => {
    Payment.findByPk(req.params.id,{
      include: [{ model: Tuition, required: true }]
    }).then((payment) => {
      if (!payment) {
        return res.status(404).send('找不到可操作的舊制收款紀錄。')
      }
      payment.update({
        isPaid: true
      }).then(() => {
        req.flash('success_messages', '確認收到款項，已更改為已繳費狀態')
        res.redirect('/cramschool/payment')
      })
    })
  },
}
module.exports = paymentController