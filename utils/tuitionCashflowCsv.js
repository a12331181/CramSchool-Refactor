const { CASH_KIND } = require('../constants/tuitionCashflow')

function csvCell(value) {
  if (Number.isSafeInteger(value)) return String(value)
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
  // Keep text that starts like a spreadsheet formula visibly textual.
  const safe = /^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(text) ? '文字：' + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}

function buildCashflowCsv(rows) {
  const header = ['實際日期', '類型', '紀錄編號', '帳單編號', '帳單月份', '學生', '收款', '退費', '淨流入']
  const lines = rows.map(row => {
    const received = row.kind === CASH_KIND.PAYMENT ? row.amount : 0
    const refunded = row.kind === CASH_KIND.REFUND ? row.amount : 0
    const label = row.paymentGroupId ? '合併收款' : received > 0 ? '收款' : '退費'
    const billReference = row.paymentGroupId ? row.billIds.join(' / ') : row.billId
    return [
      row.date, label, row.id, billReference, row.billingMonth, row.studentName,
      received, refunded, received - refunded
    ]
  })
  return '\uFEFF' + [header, ...lines].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

module.exports = { buildCashflowCsv }
