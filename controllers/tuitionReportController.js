const { getTuitionDocumentNo } = require('../utils/tuitionBillReference')
const { formatReferenceLabel } = require('../utils/referenceLabel')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { getTaipeiDate, formatTaipeiDateTime } = require('../utils/date')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')
const STUDENT_TUITION_STATUS = require('../constants/studentTuitionStatus')
const COURSE_COLLECTION_STATUS = require('../constants/courseCollectionStatus')
const tuitionReportService = require('../services/tuitionReportService')
const { amountFormat, getTuitionNavigationParams, withQuery, getTuitionBillPaymentStatusText, getRefundAmountText, getRefundStatusText, getCoursePaymentStatusText } = require('../utils/tuitionViewData.js')

const COURSE_COLLECTION_LABELS = {
  [COURSE_COLLECTION_STATUS.PAID]: ['已收齊', 'text-success'],
  [COURSE_COLLECTION_STATUS.UNPAID]: ['未收齊', 'text-danger'],
  [COURSE_COLLECTION_STATUS.REFUNDED]: ['已全額退費', 'text-info'],
  [COURSE_COLLECTION_STATUS.PARTIALLY_REFUNDED]: ['已部分退費', 'text-info'],
  [COURSE_COLLECTION_STATUS.UNISSUED]: ['部分未出帳', 'alert-warning px-1 rounded'],
  [COURSE_COLLECTION_STATUS.EMPTY]: ['本月無收費資料', 'text-muted'],
  [COURSE_COLLECTION_STATUS.NO_PAYMENT]: ['無須收款', 'text-muted'],
  [COURSE_COLLECTION_STATUS.REVIEW]: ['待核對', 'text-muted']
}

const tuitionReportController = {
  getCoursePaymentOverviewPage: async (req, res) => {
    const listUrl = '/cramschool/payment'
    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const viewData = { listUrl, billingMonth: typeof billingMonth === 'string' ? billingMonth : '' }
    res.set('Cache-Control', 'no-store')
    const result = await tuitionReportService.getCoursePaymentOverview({ billingMonth })
    if (!result.ok) {
      if (result.code === 'INVALID_BILLING_MONTH') {
        return res.status(400).render('tuition/course-overview', {
          ...viewData,
          errorMessage: '請選擇有效的計費月份。'
        })
      }
      return res.status(500).send('無法取得課程收費資料。')
    }

    const monthQuery = new URLSearchParams({ billingMonth })

    const formatAmount = amount => amount === null ? '待核對' : `NT$ ${amountFormat.format(amount)}`
    const courses = result.courses.map((course, index) => {
      const [collectionText, collectionClass] = COURSE_COLLECTION_LABELS[course.collectionStatus]
      return {
        rowNumber: index + 1,
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

    return res.render('tuition/course-overview', { ...viewData, courses })
  },

  getStudentTuitionHistoryPage: async (req, res) => {
    const courseId = req.params.courseId === undefined ? undefined : Number(req.params.courseId)
    const studentId = Number(req.params.studentId)
    const result = await tuitionReportService.getStudentTuitionHistory({ courseId, studentId })

    res.set('Cache-Control', 'no-store')

    if (!result.ok) {
      if (result.code === 'INVALID_INPUT') {
        return res.status(400).send(courseId === undefined ? '學生 ID 必須是正整數。' : '課程與學生 ID 必須是正整數。')
      }
      return res.status(404).send(result.code === 'COURSE_NOT_FOUND' ? '找不到課程。' : '找不到學生。')
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
    const pageSize = 12

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
      return res.status(400).render('tuition/student-list', { ...viewData, errorMessage: '頁碼不正確。' })
    }
    const { page } = listPage
    const result = await tuitionReportService.getStudentTuitionList({
      billingMonth,
      statusFilter,
      page,
      pageSize
    })

    if (!result.ok) {
      const errors = {
        INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
        INVALID_PAGE: '頁碼不正確。',
        INVALID_TUITION_STATUS: '請選擇有效的帳單／收款狀態。'
      }

      return res.render('tuition/student-list', {
        ...viewData,
        errorMessage: errors[result.code] ?? '目前無法取得學生學費列表。'
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
      return res.status(400).send('課程 ID 必須是正整數。')
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const pageSize = 12
    const listUrl = `/cramschool/tuition/courses/${courseId}/monthly`
    const viewData = {
      listUrl,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      backUrl: withQuery('/cramschool/payment', getTuitionNavigationParams({ billingMonth }))
    }

    res.set('Cache-Control', 'no-store')
    const listPage = getPageOffset(req.query.page, pageSize)
    if (!listPage) {
      return res.status(400).render('tuition/course-monthly-list', { ...viewData, errorMessage: '頁碼不正確。' })
    }
    const { page } = listPage
    const result = await tuitionReportService.getCourseMonthlyTuitionList({ courseId, billingMonth, page, pageSize })
    if (!result.ok) {
      if (result.code === 'COURSE_NOT_FOUND') return res.status(404).send('找不到課程。')
      const errors = {
        INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
        INVALID_PAGE: '頁碼不正確。'
      }
      return res.status(400).render('tuition/course-monthly-list', {
        ...viewData,
        errorMessage: errors[result.code] ?? '目前無法取得課程月學費。'
      })
    }

    const pagination = getPagination({ page, pageSize, totalCount: result.totalCount })
    const pageUrl = targetPage => `${listUrl}?${new URLSearchParams({ billingMonth, page: String(targetPage) })}`
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
