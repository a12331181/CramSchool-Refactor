const { CASHFLOW_PAGE_SIZE } = require('../constants/pagination')
const { formatReferenceLabel } = require('../utils/referenceLabel')
const { getTuitionCashflow } = require('../services/tuitionCashflowService')
const { CASH_KIND, CASH_REVIEW } = require('../constants/tuitionCashflow')
const { buildCashflowCsv } = require('../utils/tuitionCashflowCsv')
const { getTaipeiDate } = require('../utils/date')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')

const CASHFLOW_URL = '/cramschool/tuition/cashflow'
const CSV_URL = '/cramschool/tuition/cashflow.csv'
const amountFormat = new Intl.NumberFormat('zh-TW')
const REVIEW_LABELS = Object.freeze({
  [CASH_REVIEW.DATE]: '實際日期未填或不正確',
  [CASH_REVIEW.BILL]: '帳單關聯或狀態待核對',
  [CASH_REVIEW.AMOUNT]: '金額待核對',
  [CASH_REVIEW.GROUP]: '匯款與帳單分配待核對'
})

function formatAmount(amount) {
  if (!Number.isSafeInteger(amount)) return '—'
  return `${amount < 0 ? '-' : ''}NT$ ${amountFormat.format(Math.abs(amount))}`
}

function toDisplayRow(row) {
  const isRefund = row.kind === CASH_KIND.REFUND
  return {
    kindText: isRefund ? '退費' : row.paymentGroupId ? '合併收款' : '收款',
    id: row.id,
    documentNo: row.billId ? (row.billNo || `#${row.billId}`) : null,
    paymentGroupUrl: row.paymentGroupId ? `/cramschool/tuition/payment-groups/${row.paymentGroupId}` : null,
    groupBillCount: row.billIds?.length,
    billUrl: row.billAvailable
      ? `/cramschool/tuition/bills/${row.billId}#${isRefund ? 'refund-heading' : 'payment-summary-heading'}`
      : null,
    billingMonth: row.billingMonth ?? '—',
    studentName: formatReferenceLabel(row.studentNo, row.studentName),
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
    const view = req.query.view ?? 'verified'
    if (view !== 'verified' && view !== 'review') {
      return res.status(400).render('tuition/cashflow', { ...viewData, error: '請選擇有效的對帳清單。' })
    }
    const listPage = getPageOffset(req.query.page, CASHFLOW_PAGE_SIZE)
    if (!listPage) {
      return res.status(400).render('tuition/cashflow', { ...viewData, error: '頁碼需為正整數。' })
    }
    const { page, offset } = listPage
    const ledger = await getTuitionCashflow(cashMonth)
    if (!ledger.ok) {
      const badMonth = ledger.code === 'INVALID_CASH_MONTH'
      return res.status(badMonth ? 400 : 422).render('tuition/cashflow', {
        ...viewData,
        error: badMonth ? '請選擇有效的收退費月份。' : '金額無法加總，請核對收退費資料。'
      })
    }

    const showReview = view === 'review'
    const selectedRows = showReview ? ledger.reviewRows : ledger.rows
    const pagination = getPagination({ page, pageSize: CASHFLOW_PAGE_SIZE, totalCount: selectedRows.length })
    const viewUrl = (review, targetPage) => {
      const params = new URLSearchParams({ cashMonth })
      if (review) params.set('view', 'review')
      if (targetPage !== undefined) params.set('page', String(targetPage))
      return `${CASHFLOW_URL}?${params}`
    }
    const pageUrl = targetPage => viewUrl(showReview, targetPage)
    if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

    return res.render('tuition/cashflow', {
      ...viewData,
      receivedText: formatAmount(ledger.totals.received),
      refundedText: formatAmount(ledger.totals.refunded),
      netText: formatAmount(ledger.totals.net),
      totalCount: ledger.rows.length,
      exportUrl: `${CSV_URL}?${new URLSearchParams({ cashMonth })}`,
      rows: selectedRows.slice(offset, offset + CASHFLOW_PAGE_SIZE).map(toDisplayRow),
      verifiedUrl: viewUrl(false),
      showReview,
      reviewUrl: viewUrl(true),
      reviewCount: ledger.reviewRows.length,
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
