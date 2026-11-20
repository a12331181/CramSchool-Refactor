const { MIN_GROUP_BILLS } = require('../constants/tuitionPayment')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const { getTaipeiDate } = require('../utils/date')
const { createSessionFormToken, isValidSessionFormToken } = require('../utils/sessionFormToken')
const ATTEND_STATUS_LABELS = require('../constants/attendStatusLabels')
const { buildMonthlyPaymentNotice } = require('../utils/tuitionPaymentNotice')
const tuitionPricingService = require('../services/tuitionPricingService')
const tuitionReportService = require('../services/tuitionReportService')
const tuitionBillService = require('../services/tuitionBillService')
const { amountFormat, getTuitionNavigationParams, withQuery, getTuitionBillPaymentStatusText, getRefundAmountText } = require('../utils/tuitionViewData.js')

const tuitionPricingController = {
  getCourseTuitionPreviewPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)

    if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
      return res.status(400).send('課程與學生 ID 必須是正整數')
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const historyPath = `/cramschool/tuition/courses/${courseId}/students/${studentId}`
    const navigation = getTuitionNavigationParams({ billingMonth, page: req.query.page })
    const result = await tuitionPricingService.getTuitionPreview({
      courseId,
      studentId,
      billingMonth
    })

    const errors = {
      INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
      UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法試算。',
      ENROLLMENT_NOT_FOUND: '找不到這位學生在本課程的選課紀錄。',
      NOT_ENROLLED_IN_BILLING_MONTH: '這位學生在本月沒有有效的選課期間。',
      ENROLLMENT_UNCONFIRMED: '選課期間有缺漏或重疊，請先核對。',
      CALENDAR_REQUIRES_REVIEW: '課堂時間資料需要先核對。',
      COURSE_NOT_FOUND: '找不到課程。',
      STUDENT_NOT_FOUND: '找不到學生。',
      INVALID_BILLING_TYPE: '請先核對課程的計費方式。',
      INVALID_PRICE: '請先核對課程價格。',
      INVALID_AMOUNT: '試算金額超出可處理範圍。'
    }

    const attendanceLabels = {
      ...ATTEND_STATUS_LABELS,
      not_due: '尚未到結束時間',
      requires_review: '待核對'
    }

    const attendanceItems = result.ok
      ? result.attendanceSummary.items.map(item => ({
          ...item,
          statusText: attendanceLabels[item.status] ?? '待核對'
        }))
      : []

    return res.render('tuition/course-preview', {
      backUrl: withQuery(historyPath, navigation),
      previewUrl: `${historyPath}/preview`,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      preview: result.ok ? result : null,
      attendanceItems,
      errorMessage: result.ok ? null : (errors[result.code] ?? '目前無法試算學費。'),
      calendarId: result.calendarId,
      enrollmentId: result.enrollmentId
    })
  },

  getStudentTuitionPreviewPage: async (req, res) => {
    const studentId = Number(req.params.studentId)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return res.status(400).send('學生 ID 必須是正整數')
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const navigation = getTuitionNavigationParams({
      billingMonth,
      page: req.query.page,
      status: req.query.status
    })
    const input = { studentId, billingMonth }
    const [result, billsResult] = await Promise.all([
      tuitionPricingService.getStudentTuitionPreview(input),
      tuitionReportService.getStudentTuitionBillsForMonth(input)
    ])

    const money = value => Number.isSafeInteger(value) && value >= 0
      ? 'NT$ ' + amountFormat.format(value)
      : '待核對'
    const billRows = (billsResult.rows ?? []).map(bill => ({
      ...bill,
      statusText: bill.status === TUITION_BILL_STATUS.VOID
        ? (bill.issuedAt == null ? '已捨棄草稿' : '已作廢')
        : (bill.status === TUITION_BILL_STATUS.DRAFT ? '草稿' : getTuitionBillPaymentStatusText(bill.paymentStatus)),
      isSupplement: bill.SupplementCourseId != null,
      totalText: money(bill.totalAmount),
      remainingText: bill.status === TUITION_BILL_STATUS.ISSUED
        ? money(bill.paymentStatus?.ok ? bill.paymentStatus.remainingAmount : null)
        : '—',
      detailUrl: `/cramschool/tuition/bills/${bill.id}`
    }))
    const activeBills = billRows.filter(bill => bill.status !== TUITION_BILL_STATUS.VOID)
    const voidedBills = billRows.filter(bill => bill.status === TUITION_BILL_STATUS.VOID)
    const paymentGroupFormUrl = activeBills.filter(bill => bill.canReceiveGroupedPayment).length >= MIN_GROUP_BILLS
      ? `/cramschool/tuition/students/${studentId}/payment-groups/new?` + new URLSearchParams({ billingMonth })
      : null
    const summary = billsResult.summary
    const monthSummary = summary && {
      issuedCount: summary.issuedCount,
      issuedText: money(summary.issuedAmount),
      paidText: money(summary.paymentStatus?.ok ? summary.paymentStatus.paidAmount : null),
      remainingText: money(summary.paymentStatus?.ok ? summary.paymentStatus.remainingAmount : null),
      refundedText: getRefundAmountText(summary.refunds, 'refundedAmount'),
      netReceivedText: getRefundAmountText(summary.refunds, 'netReceivedAmount'),
      draftCount: summary.draftCount
    }

    const messages = {
      INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
      UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法試算。',
      STUDENT_NOT_FOUND: '找不到學生。',
      NO_COURSES_IN_BILLING_MONTH: '這位學生在本月沒有有效選課的課程。',
      ENROLLMENT_COURSE_UNCONFIRMED: '這筆選課的課程資料需要核對。',
      ENROLLMENT_NOT_FOUND: '找不到選課紀錄，請先核對。',
      ENROLLMENT_UNCONFIRMED: '選課期間或狀態需要核對。',
      COURSE_NOT_FOUND: '找不到課程，請先核對。',
      INVALID_BILLING_TYPE: '課程的計費方式需要核對。',
      INVALID_PRICE: '課程價格需要核對。',
      INVALID_AMOUNT: '試算金額超出可處理範圍。',
      CALENDAR_REQUIRES_REVIEW: '課堂時間需要核對。',
      NO_BILLABLE_CALENDARS: '本月沒有符合條件的正式課堂。',
      CALENDAR_REVIEW_UNAVAILABLE: '尚未取得課堂核對資訊。',
      CALENDARS_REQUIRE_REVIEW: '有課堂日期或狀態需要核對。',
      ATTENDANCE_SUMMARY_UNAVAILABLE: '尚未取得點名摘要。',
      ATTENDANCE_REQUIRES_REVIEW: '有點名項目需要人工核對。'
    }

    const courses = result.ok ? result.courses : []
    const courseNames = new Map(
      courses.map(item => [item.course.id, item.course.name])
    )

    const courseRows = courses.map(item => ({
      ...item,
      detailUrl:
        `/cramschool/tuition/courses/${item.course.id}/students/${studentId}/preview` +
        `?billingMonth=${encodeURIComponent(result.billingMonth)}`
    }))

    const reviewRows = result.ok
      ? result.reviewItems.map(item => ({
          ...item,
          label: courseNames.get(item.courseId) ??
            (item.courseId ? `課程 #${item.courseId}` : '選課資料'),
          message: messages[item.code] ?? '這筆資料需要先核對。'
        }))
      : []

    const hasSubtotal = result.ok && Number.isSafeInteger(result.baseSubtotal)

    const leaveData = result.ok
      ? await tuitionBillService.getPreviousMonthLeaveReviews({ studentId, billingMonth })
      : null

    const leaveRows = (leaveData?.rows ?? []).map(row => ({
      ...row,
      canReview:
        Number.isSafeInteger(row.attendVersion) &&
        row.attendVersion >= 0 &&
        typeof row.leaveReason === 'string' &&
        row.leaveReason.trim() !== ''
    }))

    const hasLeaveReviewForm = leaveRows.some(row => row.canReview)
    const canCreateDraft = hasSubtotal && billsResult.ok && !activeBills.some(bill => !bill.isSupplement)
    const supplement = result.ok && summary?.issuedCount > 0
      ? await tuitionBillService.getSupplementalTuitionOptions({ ...input, preview: result })
      : null
    const draftCourses = new Set(activeBills
      .filter(bill => bill.isSupplement && bill.status === TUITION_BILL_STATUS.DRAFT)
      .map(bill => bill.SupplementCourseId))
    const supplementOptions = (supplement?.options ?? [])
      .filter(entry => !draftCourses.has(entry.course.id))
      .map(entry => ({
        id: entry.course.id, name: entry.course.name, type: entry.course.type,
        quantity: entry.quantity, totalText: money(entry.baseAmount)
      }))

    if (canCreateDraft || hasLeaveReviewForm || supplementOptions.length > 0) {
      req.session.tuitionFormToken ??= createSessionFormToken()
    }

    const draftFormToken = canCreateDraft ? req.session.tuitionFormToken : null
    const supplementPanel = supplement && {
      action: `/cramschool/tuition/students/${studentId}/bills/supplement`,
      billingMonth,
      page: navigation.get('page'),
      status: navigation.get('status'),
      options: supplementOptions,
      requiresReview: !supplement.ok || supplement.requiresReview,
      formToken: supplementOptions.length > 0 ? req.session.tuitionFormToken : null
    }

    const leaveReviewPanel = leaveData && {
      ...leaveData,
      rows: leaveRows,
      billingMonth,
      formToken: hasLeaveReviewForm ? req.session.tuitionFormToken : null,
      actionBase: `/cramschool/tuition/students/${studentId}/leave-reviews`
    }

    res.set('Cache-Control', 'no-store')
    return res.render('tuition/student-preview', {
      previewUrl: `/cramschool/tuition/students/${studentId}/preview`,
      backUrl: withQuery('/cramschool/tuition/students', navigation),
      listStatus: navigation.get('status'),
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      preview: result.ok ? result : null,
      hasSubtotal,
      activeBills,
      monthSummary,
      monthlyPaymentNotice: buildMonthlyPaymentNotice({ billingMonth, bills: billsResult.rows, summary }),
      paymentGroupFormUrl,
      supplementPanel,
      voidedBills,
      draftFormToken,
      draftAction: `/cramschool/tuition/students/${studentId}/bills/draft`,
      courseRows,
      reviewRows,
      leaveReviewPanel,
      errorMessage: result.ok ? null : (messages[result.code] ?? '目前無法試算。')
    })
  },

  recordLeaveReview: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟學費預覽再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const studentId = readInt(req.params.studentId)
    const result = await tuitionBillService.recordPreviousMonthLeaveReview({
      studentId,
      billingMonth: body.billingMonth,
      attendId: readInt(req.params.attendId),
      attendVersion: readInt(body.attendVersion),
      reviewId: readInt(body.reviewId),
      decision: body.decision,
      reason: body.reviewReason,
      actorId: req.user.id
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send('審核資料格式不正確，請重新確認結果和備註。')
    }

    const errors = {
      UTC_REQUIRED: '系統時間設定異常，暫時無法儲存審核。',
      LEAVE_UNAVAILABLE: '這筆請假已無法審核，請先核對點名資料。',
      ATTEND_CHANGED: '老師已更正點名，請核對新的請假原因。',
      REVIEW_CHANGED: '審核已更新，請核對目前的結果。'
    }

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok
        ? (result.changed ? '已儲存請假審核。' : '審核結果沒有變更。')
        : errors[result.code] ?? '目前無法儲存審核。'
    )

    const query = new URLSearchParams({ billingMonth: body.billingMonth })
    return res.redirect(303, `/cramschool/tuition/students/${studentId}/preview?${query}`)
  }
}

module.exports = tuitionPricingController
