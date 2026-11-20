const { CASH_KIND, CASH_REVIEW, getTuitionCashflow } = require('../services/tuitionCashflowService')
const { buildCashflowCsv } = require('../utils/tuitionCashflowCsv')
const { getTaipeiDate } = require('../utils/date')
const { getPagination, getPaginationLinks } = require('../utils/pagination')

const CASHFLOW_URL = '/cramschool/tuition/cashflow'
const CSV_URL = '/cramschool/tuition/cashflow.csv'
const PAGE_SIZE = 20
const amountFormat = new Intl.NumberFormat('zh-TW')
const REVIEW_LABELS = Object.freeze({
  [CASH_REVIEW.DATE]: '實際日期未填或不正確',
  [CASH_REVIEW.BILL]: '帳單關聯或狀態待核對',
  [CASH_REVIEW.AMOUNT]: '金額待核對'
})

function formatAmount(amount) {
  if (!Number.isSafeInteger(amount)) return '—'
  return `${amount < 0 ? '-' : ''}NT$ ${amountFormat.format(Math.abs(amount))}`
}

function toDisplayRow(row) {
  const isRefund = row.kind === CASH_KIND.REFUND
  return {
    kindText: isRefund ? '退費' : '收款',
    id: row.id,
    billId: row.billId,
    billUrl: row.billAvailable
      ? `/cramschool/tuition/bills/${row.billId}#${isRefund ? 'refund-heading' : 'payment-summary-heading'}`
      : null,
    billingMonth: row.billingMonth ?? '—',
    studentName: row.studentName || '—',
    date: row.date || '未記錄',
    amountText: formatAmount(row.amount),
    reviewText: REVIEW_LABELS[row.review]
  }
}

function parseRequestedMonth(req) {
  return req.query.cashMonth ?? getTaipeiDate().slice(0, 7)
}

const tuitionCashflowController = {
  getCashflow: async (req, res) => {
    const cashMonth = parseRequestedMonth(req)
    const viewData = {
      formAction: CASHFLOW_URL,
      cashMonth: typeof cashMonth === 'string' ? cashMonth : ''
    }
    res.set('Cache-Control', 'no-store')
    const rawPage = req.query.page ?? '1'
    if (typeof rawPage !== 'string' || !/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage))) {
      return res.status(400).render('tuition/cashflow', { ...viewData, error: '頁碼需為正整數。' })
    }
    const page = Number(rawPage)
    const ledger = await getTuitionCashflow(cashMonth)
    if (!ledger.ok) {
      const badMonth = ledger.code === 'INVALID_CASH_MONTH'
      return res.status(badMonth ? 400 : 422).render('tuition/cashflow', {
        ...viewData,
        error: badMonth ? '請選擇有效的收退費月份。' : '金額無法加總，請核對收退費資料。'
      })
    }

    const pagination = getPagination({ page, pageSize: PAGE_SIZE, totalCount: ledger.rows.length })
    const pageUrl = targetPage => `${CASHFLOW_URL}?${new URLSearchParams({ cashMonth, page: targetPage })}`
    if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

    const offset = (page - 1) * PAGE_SIZE
    return res.render('tuition/cashflow', {
      ...viewData,
      receivedText: formatAmount(ledger.totals.received),
      refundedText: formatAmount(ledger.totals.refunded),
      netText: formatAmount(ledger.totals.net),
      totalCount: ledger.rows.length,
      exportUrl: `${CSV_URL}?${new URLSearchParams({ cashMonth })}`,
      rows: ledger.rows.slice(offset, offset + PAGE_SIZE).map(toDisplayRow),
      reviewCount: ledger.reviewRows.length,
      reviewRows: ledger.reviewRows.slice(0, PAGE_SIZE).map(toDisplayRow),
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getCashflowCsv: async (req, res) => {
    const cashMonth = parseRequestedMonth(req)
    res.set('Cache-Control', 'no-store')
    const ledger = await getTuitionCashflow(cashMonth)
    if (!ledger.ok) {
      return ledger.code === 'INVALID_CASH_MONTH'
        ? res.status(400).type('text/plain').send('請選擇有效的收退費月份。')
        : res.status(422).type('text/plain').send('金額無法加總，請核對收退費資料。')
    }
    return res.attachment(`cramschool-cashflow-${cashMonth}.csv`)
      .type('text/csv')
      .send(buildCashflowCsv(ledger.rows))
  }
}

module.exports = tuitionCashflowController
