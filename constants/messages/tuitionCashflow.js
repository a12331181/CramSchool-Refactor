const { CASH_REVIEW } = require('../tuitionCashflow')

module.exports = Object.freeze({
  invalidCashflowFilter: '請選擇有效的對帳清單。',
  invalidCashflowPage: '頁碼需為正整數。',
  invalidCashflowMonth: '請選擇有效的收退費月份。',
  invalidCashflowTotals: '金額無法加總，請核對收退費資料。',
  reviewLabels: Object.freeze({
    [CASH_REVIEW.DATE]: '實際日期未填或不正確',
    [CASH_REVIEW.BILL]: '帳單關聯或狀態待核對',
    [CASH_REVIEW.AMOUNT]: '金額待核對',
    [CASH_REVIEW.GROUP]: '匯款與帳單分配待核對'
  }),
  getCashflowCsvInvalidMonth: '請選擇有效的收退費月份。',
  getCashflowCsvUnavailableAmountProfile: '金額無法加總，請核對收退費資料。'
})
