const { MIN_GROUP_BILLS, MAX_GROUP_NOTE_LENGTH } = require('../tuitionPayment')
const common = require('./common')

module.exports = Object.freeze({
  invalidPaymentInput: '帳單或收款資料不正確，請重新開啟帳單再試。',
  receivedPayment: (receivedAmount, remainingAmount) =>
    `已登記收款 NT$ ${receivedAmount}，剩餘未收 NT$ ${remainingAmount}。`,
  alreadySettled: '這張帳單已結清，本次未新增收款。',
  balanceChanged: (remainingAmount) => `目前未收金額為 NT$ ${remainingAmount}，請核對後再登記。`,
  invalidRefundInput: '帳單 ID、版本或退費金額不正確；金額須為大於零的台幣整數。',
  recordTuitionBillPaymentErrors: {
    BILL_NOT_ISSUED: '只有已出帳的帳單可以登記收款。',
    BILL_NO_PAYMENT_REQUIRED: '這張帳單無須收款。',
    BILL_VERSION_CONFLICT: '帳單已更新，請核對最新的未付項目後再登記。',
    PAYMENT_ITEMS_REQUIRED: '請至少勾選一項未付明細。',
    PAYMENT_ITEMS_UNAVAILABLE: '這張帳單目前只能整筆登記剩餘金額。',
    PAYMENT_ITEMS_CHANGED: '勾選的項目已付款或不在這張帳單，請重新確認。',
    PAYMENT_ALLOCATIONS_REQUIRE_REVIEW: '分項收款紀錄需要核對，暫時不能再登記收款。',
    PAYMENT_AMOUNT_OUT_OF_RANGE: '本次收款金額超出可登記範圍，請核對勾選項目。'
  },
  recordTuitionPaymentGroupErrors: {
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
  },
  recordTuitionBillPaymentInvalidBill: common.INVALID_BILL,
  recordTuitionBillPaymentInvalidPayment: '請輸入有效的實際收款日，不可晚於今天。',
  recordTuitionBillPaymentNotFoundBill: common.NOT_FOUND_BILL,
  recordTuitionBillPaymentUnavailableBillPayment: '暫時無法登記收款，請核對帳單。',
  recordTuitionBillRefundInvalidBill: common.INVALID_BILL,
  recordTuitionBillRefundNotFoundBill: common.NOT_FOUND_BILL,
  recordTuitionBillRefundSaved: '已登記退費。',
  recordTuitionBillRefundUnavailableBill: '暫時無法登記退費，請核對帳單。',
  getTuitionPaymentGroupFormInvalidMonthStudent: '請選擇有效的學生及計費月份。',
  recordTuitionPaymentGroupInvalidPayment: '表單已失效，請重新開啟合併收款頁再試。',
  recordTuitionPaymentGroupSavedPayment: '已登記一筆合併收款。',
  recordTuitionPaymentGroupSavedPayment2: '這筆合併收款已登記，未重複新增。',
  recordTuitionPaymentGroupInvalidPaymentProfile: '收款資料不正確，請重新開啟收款頁再試。',
  recordTuitionPaymentGroupNotFoundStudent: '找不到這位學生。',
  recordTuitionPaymentGroupUnavailableAmountBill: (value1) =>
    `所勾選的帳單待繳合計 NT$ ${value1}。匯款金額不符，尚未登記。`,
  recordTuitionPaymentGroupUnavailableBillPayment: '暫時無法登記這筆收款，請先核對帳單。',
  getTuitionPaymentGroupDetailsInvalidPayment: '合併收款編號不正確。',
  getTuitionPaymentGroupDetailsNotFoundPayment: '找不到這筆合併收款。'
})
