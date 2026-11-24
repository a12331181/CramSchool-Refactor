// 呈現按月份、課程及學生查詢的收費報表。

const responses = require('../constants/messages/tuitionReport')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')
const STUDENT_TUITION_STATUS = require('../constants/studentTuitionStatus')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')

const tuitionReportService = require('../services/tuitionReportService')

const { getTaipeiDate, formatTaipeiDateTime } = require('../utils/date')
const { sendPageError } = require('../utils/pageError')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')
const { formatReferenceLabel } = require('../utils/referenceLabel')
const { getTuitionDocumentNo } = require('../utils/tuitionBillReference')
const { amountFormat, getTuitionNavigationParams, withQuery, getTuitionBillPaymentStatusText, getRefundAmountText, getRefundStatusText, getCoursePaymentStatusText } = require('../utils/tuitionViewData.js')

const COURSE_COLLECTION_LABELS = responses.collectionLabels

const tuitionReportController = {
  getCoursePaymentOverviewPage: async (req, res) => {
    const listUrl = '/cramschool/payment'
    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const viewData = { listUrl, billingMonth: typeof billingMonth === 'string' ? billingMonth : '' }
    res.set('Cache-Control', 'no-store')
    const position = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)
    const filter = req.query.filter ?? 'all'
    const includeTotals = req.query.totals === '1'
    if (!position || !['all', 'unpaid', 'review'].includes(filter)) return sendPageError(res, 400, responses.getCoursePaymentOverviewPageInvalidPageFilter)
    const result = await tuitionReportService.getCoursePaymentOverview({ billingMonth, page: position.page,
      pageSize: DIRECTORY_PAGE_SIZE, filter, includeTotals })
    if (!result.ok) {
      if (result.code === 'INVALID_BILLING_MONTH') {
        return res.status(400).render('tuition/course-overview', {
          ...viewData,
          errorMessage: responses.getCoursePaymentOverviewPageInvalidMonth
        })
      }
      return sendPageError(res, 500, responses.getCoursePaymentOverviewPageUnavailableCourseProfile)
    }

    const pagination = getPagination({ page: position.page, pageSize: DIRECTORY_PAGE_SIZE, totalCount: result.totalCount })
    const pageUrl = page => listUrl + '?' + new URLSearchParams({ billingMonth, filter, page, ...(includeTotals && { totals: '1' }) })
    if (position.page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))
    const monthQuery = new URLSearchParams({ billingMonth, fromPage: position.page, fromFilter: filter, ...(includeTotals && { fromTotals: '1' }) })

    const formatAmount = amount => amount === null ? '待核對' : `NT$ ${amountFormat.format(amount)}`
    const courses = result.courses.map((course, index) => {
      const [collectionText, collectionClass] = COURSE_COLLECTION_LABELS[course.collectionStatus]
      return {
        rowNumber: position.offset + index + 1,
        courseLabel: formatReferenceLabel(course.courseNo, course.name),
        isClosed: Number(course.isActive) === 0,
        receivableText: formatAmount(course.receivableAmount),
        receivedText: formatAmount(course.receivedAmount),
        refundedText: formatAmount(course.refundedAmount),
        netReceivedText: formatAmount(course.netReceivedAmount),
        remainingText: formatAmount(course.remainingAmount),
        collectionText,
        collectionClass,
        detailUrl: `/cramschool/tuition/courses/${course.id}/monthly?${monthQuery}`
      }
    })

    return res.render('tuition/course-overview', { ...viewData, courses, filter, includeTotals,
      totals: result.totals && Object.fromEntries(Object.entries(result.totals).map(([k, v]) => [k, formatAmount(v)])),
      ...getPaginationLinks(pagination, pageUrl) })
  },

  getStudentTuitionHistoryPage: async (req, res) => {
    const courseId = req.params.courseId === undefined ? undefined : Number(req.params.courseId)
    const studentId = Number(req.params.studentId)
    const result = await tuitionReportService.getStudentTuitionHistory({ courseId, studentId })

    res.set('Cache-Control', 'no-store')

    if (!result.ok) {
      if (result.code === 'INVALID_INPUT') {
        return sendPageError(res, 400, courseId === undefined ? responses.getStudentTuitionHistoryPageInvalidStudent : responses.getStudentTuitionHistoryPageInvalidStudentCourse)
      }
      return sendPageError(res, 404, result.code === 'COURSE_NOT_FOUND' ? responses.getStudentTuitionHistoryPageNotFoundCourse : responses.getStudentTuitionHistoryPageNotFoundStudent)
    }

    const { course, student } = result
    const { billingMonth, page, status } = req.query
    const navigation = getTuitionNavigationParams({
      billingMonth,
      page,
      status: course ? undefined : status
    })
    const previewPath = course
      ? `/cramschool/tuition/courses/${courseId}/students/${studentId}/preview`
      : `/cramschool/tuition/students/${studentId}/preview`
    const backPath = course
      ? `/cramschool/tuition/courses/${courseId}/monthly`
      : '/cramschool/tuition/students'
    const rows = result.rows.map(({ bill, amount, paymentStatus, refunds }) => {
      const isIssued = bill.status === TUITION_BILL_STATUS.ISSUED
      const isVoid = bill.status === TUITION_BILL_STATUS.VOID
      const wasIssued = isIssued || (isVoid && bill.issuedAt != null)
      const paidOnText = isIssued && (!paymentStatus?.ok || paymentStatus.paidAmount > 0)
        ? paymentStatus?.lastPaidOn ?? '待核對'
        : '—'
      let statusText = '未出帳'
      if (isVoid) statusText = wasIssued ? '已作廢' : '草稿已廢棄'
      else if (isIssued && course) statusText = getCoursePaymentStatusText(paymentStatus)
      else if (isIssued && paymentStatus?.ok && !refunds?.ok) statusText = '退費紀錄待核對'
      else if (isIssued) statusText = getRefundStatusText(refunds) ?? getTuitionBillPaymentStatusText(paymentStatus)

      return {
        documentNo: getTuitionDocumentNo(bill),
        billingMonth: bill.billingMonth,
        issuedOnText: wasIssued ? (formatTaipeiDateTime(bill.issuedAt)?.slice(0, 10) ?? '待核對') : '—',
        amount,
        hasAmount: Number.isSafeInteger(amount) && amount >= 0,
        amountUnavailableText: isVoid ? '—' : '待核對',
        statusText,
        refundedText: getRefundAmountText(refunds, 'refundedAmount'),
        netReceivedText: getRefundAmountText(refunds, 'netReceivedAmount'),
        paidOnText,
        detailUrl: `/cramschool/tuition/bills/${bill.id}${isIssued ? '#payment-summary-heading' : ''}`,
        detailText: isVoid ? '查看作廢紀錄' : isIssued ? '查看收款資訊' : '查看草稿'
      }
    })

    return res.render('tuition/history', {
      course,
      student,
      rows,
      previewUrl: withQuery(previewPath, navigation),
      backUrl: withQuery(backPath, navigation)
    })
  },

  getStudentTuitionListPage: async (req, res) => {
    const listUrl = '/cramschool/tuition/students'
    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const statusFilter = req.query.status ?? 'all'
    const pageSize = DIRECTORY_PAGE_SIZE

    const viewData = {
      listUrl,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      statusOptions: Object.entries(STUDENT_TUITION_STATUS).map(([value, label]) => ({
        value, label, selected: value === statusFilter
      }))
    }

    res.set('Cache-Control', 'no-store')
    const listPage = getPageOffset(req.query.page, pageSize)
    if (!listPage) {
      return res.status(400).render('tuition/student-list', { ...viewData, errorMessage: responses.getStudentTuitionListPageInvalidPage })
    }
    const { page } = listPage
    const result = await tuitionReportService.getStudentTuitionList({
      billingMonth,
      statusFilter,
      page,
      pageSize
    })

    if (!result.ok) {
      const errors = responses.getStudentTuitionListPageErrors

      return res.render('tuition/student-list', {
        ...viewData,
        errorMessage: errors[result.code] ?? responses.getStudentTuitionListPageUnavailableStudent
      })
    }

    const pagination = getPagination({
      page,
      pageSize,
      totalCount: result.totalCount
    })

    const listQuery = targetPage => {
      const params = new URLSearchParams({ billingMonth, page: String(targetPage) })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      return params
    }
    const pageUrl = targetPage => `${listUrl}?${listQuery(targetPage)}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    const detailQuery = listQuery(page)
    const rows = result.rows.map(row => {
      const { bill, summary } = row
      const paymentStatus = summary?.paymentStatus
      const refunds = summary?.refunds
      const isIssued = summary?.issuedCount > 0
      const amount = summary ? (isIssued ? summary.issuedAmount : summary.draftAmount) : row.baseSubtotal
      const hasAmount = Number.isSafeInteger(amount) && amount >= 0
      const hasRemainingAmount = isIssued && paymentStatus?.ok === true
      let statusText = '未開單'

      if (isIssued) {
        statusText = getTuitionBillPaymentStatusText(paymentStatus)
      } else if (summary?.draftCount > 0) {
        statusText = hasAmount ? '草稿' : '草稿待核對'
      } else if (row.code === 'NO_COURSES_IN_BILLING_MONTH') {
        statusText = '本月無有效選課'
      } else if (row.reviewCount > 0) {
        statusText = `試算待核對（${row.reviewCount} 項）`
      } else if (row.code || !hasAmount) {
        statusText = '試算待核對'
      }

      return {
        studentLabel: formatReferenceLabel(row.student.studentNo, row.student.name),
        amount,
        hasAmount,
        amountSourceText: isIssued ? '正式帳單合計' : (summary ? '草稿金額' : '基本學費試算'),
        pendingDraftCount: isIssued ? summary.draftCount : 0,
        hasMonthSummary: Boolean(summary),
        statusText,
        refundStatusText: refunds?.ok === false && paymentStatus?.ok
          ? '退費紀錄待核對'
          : getRefundStatusText(refunds),
        refundedText: getRefundAmountText(refunds, 'refundedAmount'),
        netReceivedText: getRefundAmountText(refunds, 'netReceivedAmount'),
        hasRemainingAmount,
        remainingAmount: hasRemainingAmount ? paymentStatus.remainingAmount : null,
        billUrl: bill ? `/cramschool/tuition/bills/${bill.id}` : null,
        documentNo: bill ? getTuitionDocumentNo(bill) : null,
        historyUrl: withQuery(`${listUrl}/${row.student.id}/history`, detailQuery),
        previewUrl: withQuery(`${listUrl}/${row.student.id}/preview`, detailQuery)
      }
    })

    return res.render('tuition/student-list', {
      ...viewData,
      rows,
      totalCount: result.totalCount,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getCourseMonthlyTuitionPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.getCourseMonthlyTuitionPageInvalidCourse)
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const pageSize = DIRECTORY_PAGE_SIZE
    const listUrl = `/cramschool/tuition/courses/${courseId}/monthly`
    const viewData = {
      listUrl,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      backUrl: '/cramschool/payment?' + new URLSearchParams({ billingMonth,
        page: getPageOffset(req.query.fromPage, DIRECTORY_PAGE_SIZE)?.page ?? 1,
        filter: ['unpaid', 'review'].includes(req.query.fromFilter) ? req.query.fromFilter : 'all',
        ...(req.query.fromTotals === '1' && { totals: '1' }) })
    }

    res.set('Cache-Control', 'no-store')
    const listPage = getPageOffset(req.query.page, pageSize)
    if (!listPage) {
      return res.status(400).render('tuition/course-monthly-list', { ...viewData, errorMessage: responses.getCourseMonthlyTuitionPageInvalidPage })
    }
    const { page } = listPage
    const result = await tuitionReportService.getCourseMonthlyTuitionList({ courseId, billingMonth, page, pageSize })
    if (!result.ok) {
      if (result.code === 'COURSE_NOT_FOUND') return sendPageError(res, 404, responses.getCourseMonthlyTuitionPageNotFoundCourse)
      const errors = responses.getCourseMonthlyTuitionPageErrors
      return res.status(400).render('tuition/course-monthly-list', {
        ...viewData,
        errorMessage: errors[result.code] ?? responses.getCourseMonthlyTuitionPageUnavailableCourse
      })
    }

    const pagination = getPagination({ page, pageSize, totalCount: result.totalCount })
    const pageUrl = targetPage => `${listUrl}?${new URLSearchParams({ billingMonth, page: String(targetPage), fromPage: String(getPageOffset(req.query.fromPage, DIRECTORY_PAGE_SIZE)?.page ?? 1), fromFilter: ['unpaid','review'].includes(req.query.fromFilter) ? req.query.fromFilter : 'all', ...(req.query.fromTotals === '1' && { fromTotals: '1' }) })}`
    if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

    const rows = result.rows.map(({
      studentId, student, bill, draftCount, enrollmentNeedsReview, hasCourseFee, courseAmount, coursePayment
    }) => {
      const isIssuedForCourse = hasCourseFee && bill?.status === TUITION_BILL_STATUS.ISSUED
      const hasAmount = Number.isSafeInteger(courseAmount) && courseAmount >= 0
      const amountText = amount => `NT$ ${amountFormat.format(amount)}`
      const issuedAmountText = field =>
        !isIssuedForCourse ? '—' : coursePayment?.ok ? amountText(coursePayment[field]) : '待核對'
      let statusText = '未開單'

      if (hasCourseFee) {
        statusText = isIssuedForCourse
          ? getCoursePaymentStatusText(coursePayment)
          : hasAmount ? '草稿' : '本課金額待核對'
      } else if (bill) {
        statusText = bill.status === TUITION_BILL_STATUS.DRAFT ? '草稿未含本課' : '帳單未含本課'
      } else if (!student) {
        statusText = '學生資料待核對'
      } else if (enrollmentNeedsReview) {
        statusText = '選課日期待核對'
      }

      return {
        studentName: formatReferenceLabel(student?.studentNo, student?.name ?? bill?.studentNameSnapshot ?? `學生 #${studentId}`),
        statusText,
        amountText: hasAmount ? amountText(courseAmount) : hasCourseFee ? '待核對' : '—',
        receivedText: issuedAmountText('paidAmount'),
        refundedText: issuedAmountText('refundedAmount'),
        netReceivedText: issuedAmountText('netReceivedAmount'),
        remainingText: issuedAmountText('remainingAmount'),
        pendingDraftCount: isIssuedForCourse ? draftCount : 0
      }
    })

    return res.render('tuition/course-monthly-list', {
      ...viewData,
      course: result.course,
      rows,
      totalCount: result.totalCount,
      ...getPaginationLinks(pagination, pageUrl)
    })
  }
}

module.exports = tuitionReportController
