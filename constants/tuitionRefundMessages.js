module.exports = Object.freeze({
  BILL_NOT_ISSUED: '只有已出帳的帳單可以登記退費。',
  BILL_NOT_FULLY_PAID: '只有已收清的帳單可以登記退費。',
  BILL_VERSION_CONFLICT: '帳單已更新，請核對目前的退費紀錄與可退金額。',
  INVALID_REFUND_REASON: '請填寫退費原因，最多 255 字元。',
  INVALID_REFUND_DATE: '退費日期必須介於最後收款日與今天之間。',
  REFUND_TOTAL_REQUIRES_REVIEW: '累計退費金額需要核對。',
  REFUND_PAYMENT_DATE_UNCONFIRMED: '原收款日期需要核對，暫時無法登記退費。',
  REFUND_HAS_LEAVE_CREDIT: '這張帳單已作為請假折抵的來源，暫時無法登記退費。',
  REFUND_ALLOCATIONS_REQUIRE_REVIEW: '收款或退費的分配需要核對，暫時無法再登記。',
  REFUND_ITEMS_REQUIRED: '請在欲退費的品項填入金額。',
  REFUND_ITEMS_UNAVAILABLE: '這張帳單的部分款項未分配到品項，只能登記整單退費。',
  REFUND_ITEMS_CHANGED: '退費品項不在本張帳單或已無可退餘額，請重新核對。',
  REFUND_ITEM_EXCEEDS_PAID_AMOUNT: '其中一筆退費超過該品項的可退餘額。',
  REFUND_EXCEEDS_PAID_AMOUNT: '退費金額超過目前可退的餘額，請核對後再試。'
})
