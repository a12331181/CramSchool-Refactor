const responses = require('../constants/messages/tuitionPricing')
const { sendPageError } = require('../utils/pageError')
const { getTuitionDocumentNo } = require('../utils/tuitionBillReference')
const { formatReferenceLabel } = require('../utils/referenceLabel')
const { getStudentReference } = require('../services/studentService')
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
      return sendPageError(res, 400, responses.getCourseTuitionPreviewPageInvalidStudentCourse)
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const historyPath = `/cramschool/tuition/courses/${courseId}/students/${studentId}`
    const navigation = getTuitionNavigationParams({ billingMonth, page: req.query.page })
    const result = await tuitionPricingService.getTuitionPreview({
      courseId,
      studentId,
      billingMonth
    })

    const errors = responses.getCourseTuitionPreviewPageErrors

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

    const student = result.ok ? await getStudentReference(studentId) : null

    return res.render('tuition/course-preview', {
      student,
      backUrl: withQuery(historyPath, navigation),
      previewUrl: `${historyPath}/preview`,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      preview: result.ok ? result : null,
      attendanceItems,
      errorMessage: result.ok ? null : (errors[result.code] ?? responses.getCourseTuitionPreviewPageUnavailable),
      calendarId: result.calendarId,
      enrollmentId: result.enrollmentId
    })
  },

  getStudentTuitionPreviewPage: async (req, res) => {
    const studentId = Number(req.params.studentId)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return sendPageError(res, 400, responses.getStudentTuitionPreviewPageInvalidStudent)
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
      status: bill.status,
      SupplementCourseId: bill.SupplementCourseId,
      canReceiveGroupedPayment: bill.canReceiveGroupedPayment,
      studentNameSnapshot: bill.studentNameSnapshot,
      totalAmount: bill.totalAmount,
      documentNo: getTuitionDocumentNo(bill),
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

    const messages = responses.getStudentTuitionPreviewPageErrors

    const courses = result.ok ? result.courses : []
    const courseNames = new Map(
      courses.map(({ course }) => [course.id, formatReferenceLabel(course.courseNo, course.name)])
    )

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
        id: entry.course.id, name: entry.course.name, courseNo: entry.course.courseNo, type: entry.course.type,
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
      preview: result.ok ? {
        student: result.student, billingMonth: result.billingMonth, baseSubtotal: result.baseSubtotal
      } : null,
      hasSubtotal,
      activeBills,
      monthSummary,
      monthlyPaymentNotice: buildMonthlyPaymentNotice({ billingMonth, bills: billsResult.rows, summary }),
      paymentGroupFormUrl,
      supplementPanel,
      voidedBills,
      draftFormToken,
      draftAction: `/cramschool/tuition/students/${studentId}/bills/draft`,
      courseRows: courses.map(({ course, billableCount, quantity, unitPrice, baseAmount }) => ({
        course, billableCount, quantity, unitPrice, baseAmount
      })),
      reviewRows,
      leaveReviewPanel,
      errorMessage: result.ok ? null : (messages[result.code] ?? responses.getStudentTuitionPreviewPageUnavailable)
    })
  },

  recordLeaveReview: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return sendPageError(res, 403, responses.recordLeaveReviewInvalid)
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
      return sendPageError(res, 400, responses.recordLeaveReviewInvalidProfile)
    }

    const errors = responses.recordLeaveReviewErrors

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok
        ? (result.changed ? responses.recordLeaveReviewSavedLeave : responses.recordLeaveReviewUnchanged)
        : errors[result.code] ?? responses.recordLeaveReviewUnavailable
    )

    const query = new URLSearchParams({ billingMonth: body.billingMonth })
    return res.redirect(303, `/cramschool/tuition/students/${studentId}/preview?${query}`)
  }
}

module.exports = tuitionPricingController
