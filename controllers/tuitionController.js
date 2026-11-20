const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const tuitionService = require('../services/tuitionService')
const { getTaipeiDate, formatTaipeiDateTime } = require('../utils/date')
const { getPagination, getPaginationLinks } = require('../utils/pagination')
const { createSessionFormToken, isValidSessionFormToken } = require('../utils/sessionFormToken')
const ATTEND_STATUS_LABELS = require('../constants/attendStatusLabels')
const STUDENT_TUITION_STATUS = require('../constants/studentTuitionStatus')
const COURSE_COLLECTION_STATUS = require('../constants/courseCollectionStatus')
const COURSE_PAYMENT_REVIEW = require('../constants/coursePaymentReview')
const REFUND_MESSAGES = require('../constants/tuitionRefundMessages')

const COURSE_COLLECTION_LABELS = {
  [COURSE_COLLECTION_STATUS.PAID]: ['已收齊', 'text-success'],
  [COURSE_COLLECTION_STATUS.UNPAID]: ['未收齊', 'text-danger'],
  [COURSE_COLLECTION_STATUS.UNISSUED]: ['部分未出帳', 'alert-warning px-1 rounded'],
  [COURSE_COLLECTION_STATUS.EMPTY]: ['本月無收費資料', 'text-muted'],
  [COURSE_COLLECTION_STATUS.NO_PAYMENT]: ['無須收款', 'text-muted'],
  [COURSE_COLLECTION_STATUS.REVIEW]: ['待核對', 'text-muted']
}

const amountFormat = new Intl.NumberFormat('zh-TW')

function getTuitionNavigationParams({ billingMonth, page, status }) {
  const params = new URLSearchParams()

  if (typeof billingMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
    params.set('billingMonth', billingMonth)
  }

  const pageNumber = Number(page)
  if (Number.isSafeInteger(pageNumber) && pageNumber > 1) {
    params.set('page', String(pageNumber))
  }

  if (typeof status === 'string' && status !== 'all' && Object.hasOwn(STUDENT_TUITION_STATUS, status)) {
    params.set('status', status)
  }

  return params
}

function withQuery(path, params) {
  return params.size ? `${path}?${params}` : path
}

function getTuitionBillPaymentStatusText(paymentStatus) {
  return STUDENT_TUITION_STATUS[tuitionService.getTuitionBillPaymentState(paymentStatus)]
}

function getCoursePaymentStatusText(coursePayment) {
  if (coursePayment?.code === COURSE_PAYMENT_REVIEW.REFUND_UNASSIGNED) return '整單退費待核對'
  if (coursePayment?.code === COURSE_PAYMENT_REVIEW.PAYMENT_UNASSIGNED) return '分項收款待核對'
  return getTuitionBillPaymentStatusText(coursePayment)
}

function buildTuitionPaymentNotice(bill, paymentStatus) {
  if (
    bill.status !== TUITION_BILL_STATUS.ISSUED || !paymentStatus?.ok ||
    !(paymentStatus.remainingAmount > 0) ||
    paymentStatus.totalAmount !== bill.totalAmount ||
    bill.items.length === 0
  ) return null

  const singleLine = text => typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  const studentName = singleLine(bill.studentNameSnapshot)
  if (!studentName || !/^\d{4}-(0[1-9]|1[0-2])$/.test(bill.billingMonth)) return null

  const numbers = new Intl.NumberFormat('zh-TW')
  const money = amount => `${amount < 0 ? '-' : ''}NT$ ${numbers.format(Math.abs(amount))}`
  const itemLines = []
  let itemTotal = 0

  for (const { descriptionSnapshot, quantity, unitPrice, amount } of bill.items) {
    const description = singleLine(descriptionSnapshot)
    if (!description || !Number.isSafeInteger(amount)) return null

    const calculation =
      Number.isSafeInteger(quantity) && quantity > 1 &&
      Number.isSafeInteger(unitPrice) && unitPrice >= 0 && quantity * unitPrice === amount
        ? `（${quantity} × ${money(unitPrice)}）`
        : ''
    itemLines.push(`・${description}${calculation}：${money(amount)}`)
    itemTotal += amount
  }

  if (itemTotal !== bill.totalAmount) return null

  const { totalAmount, paidAmount, remainingAmount } = paymentStatus
  return [
    `家長您好，以下是 ${studentName} ${bill.billingMonth} 的學費明細：`,
    '',
    ...itemLines,
    '',
    `本期應收：${money(totalAmount)}`,
    ...(paidAmount > 0 ? [`已收金額：${money(paidAmount)}`] : []),
    `尚需繳費：${money(remainingAmount)}`,
    '',
    '再麻煩您確認，謝謝！'
  ].join('\n')
}

function describeTuitionBillChange({ before, after }) {
  const hasTotal = Number.isSafeInteger(after?.totalAmount)
  const amountText = hasTotal ? `帳單金額 NT$ ${after.totalAmount}` : '—'

  if (before?.status === TUITION_BILL_STATUS.DRAFT && after?.status === TUITION_BILL_STATUS.ISSUED) {
    const skippedCount = Array.isArray(after.skippedLeaveCredits) ? after.skippedLeaveCredits.length : 0
    return {
      actionText: '正式出帳',
      detailText: skippedCount > 0 ? `${amountText}｜本張未折抵 ${skippedCount} 筆請假` : amountText
    }
  }

  if (after?.status === TUITION_BILL_STATUS.VOID && [TUITION_BILL_STATUS.DRAFT, TUITION_BILL_STATUS.ISSUED].includes(before?.status)) {
    const releasedCount = Array.isArray(before.activeLeaveCredits) ? before.activeLeaveCredits.length : 0
    return {
      actionText: before.status === TUITION_BILL_STATUS.DRAFT ? '捨棄草稿' : '作廢帳單',
      detailText: releasedCount > 0 ? `保留原明細，釋放 ${releasedCount} 筆請假折抵` : '保留原明細'
    }
  }

  if (Number.isSafeInteger(after?.refundId) && Number.isSafeInteger(after?.refundAmount)) {
    return {
      actionText: '登記退費',
      detailText: `${after.refundedOn}｜NT$ ${after.refundAmount}（退費 #${after.refundId}）`
    }
  }

  if (Number.isSafeInteger(after?.paymentId) && Number.isSafeInteger(after?.receivedAmount)) {
    const items = Number.isSafeInteger(after.allocatedItemCount)
      ? `，${after.allocatedItemCount} 項明細`
      : ''
    return {
      actionText: '登記收款',
      detailText: `NT$ ${after.receivedAmount}（收款 #${after.paymentId}${items}）`
    }
  }

  const amountChange = hasTotal && Number.isSafeInteger(before?.totalAmount) && before.totalAmount !== after.totalAmount
    ? `帳單金額 NT$ ${before.totalAmount} → NT$ ${after.totalAmount}`
    : amountText

  if (Number.isSafeInteger(after?.discount?.amount)) {
    const previous = before?.discount?.amount
    const next = after.discount.amount
    const discountText = Number.isSafeInteger(previous) && previous !== next
      ? `折扣 NT$ ${previous} → NT$ ${next}`
      : `折扣 NT$ ${next}`
    return {
      actionText: before?.discount ? '修改帳單折扣' : '加入帳單折扣',
      detailText: `${discountText}｜${amountChange}`
    }
  }

  if (Number.isSafeInteger(after?.removedBillItemId)) {
    const { kind, descriptionSnapshot } = before?.item ?? {}
    const labels = { [TUITION_BILL_ITEM_KIND.LEAVE_CREDIT]: '移除請假折抵', [TUITION_BILL_ITEM_KIND.EXTRA_FEE]: '移除額外費用', [TUITION_BILL_ITEM_KIND.DISCOUNT]: '移除帳單折扣' }
    return {
      actionText: labels[kind] ?? '移除明細',
      detailText: descriptionSnapshot ? `${descriptionSnapshot}｜${amountChange}` : amountChange
    }
  }

  return {
    actionText: Array.isArray(after?.courseFees) ? '更新草稿' : '帳單異動',
    detailText: amountChange
  }
}

function buildTuitionBillHistory({ logs, actors, limit }) {
  const actorNames = new Map(actors.map(actor => {
    const name = actor.name?.trim() || '未設定名稱'
    const account = actor.userNo || `帳號 #${actor.id}`
    return [actor.id, `${account}｜${name}`]
  }))

  return {
    limit,
    rows: logs.map(log => ({
      ...describeTuitionBillChange(log),
      occurredAtText: formatTaipeiDateTime(log.occurredAt) ?? '待核對',
      actorText: actorNames.get(log.actorId) ?? `帳號 #${log.actorId}`,
      reason: log.reason?.trim() || '—'
    }))
  }
}

const tuitionController = {
  getCoursePaymentOverview: async (req, res) => {
    const listUrl = '/cramschool/payment'
    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const viewData = { listUrl, billingMonth: typeof billingMonth === 'string' ? billingMonth : '' }
    res.set('Cache-Control', 'no-store')
    const result = await tuitionService.getCoursePaymentOverview({ billingMonth })
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
    const courses = result.courses.map(course => {
      const [collectionText, collectionClass] = COURSE_COLLECTION_LABELS[course.collectionStatus]
      return {
        id: course.id,
        name: course.name,
        receivableText: formatAmount(course.receivableAmount),
        receivedText: formatAmount(course.receivedAmount),
        remainingText: formatAmount(course.remainingAmount),
        collectionText,
        collectionClass,
        detailUrl: `/cramschool/tuition/courses/${course.id}/monthly?${monthQuery}`
      }
    })

    return res.render('tuition/course-overview', { ...viewData, courses })
  },

  getStudentTuitionHistory: async (req, res) => {
    const courseId = req.params.courseId === undefined ? undefined : Number(req.params.courseId)
    const studentId = Number(req.params.studentId)
    const result = await tuitionService.getStudentTuitionHistory({ courseId, studentId })

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
    const rows = result.rows.map(({ bill, amount, paymentStatus }) => {
      const isIssued = bill.status === TUITION_BILL_STATUS.ISSUED
      const paidOnText = isIssued && (!paymentStatus?.ok || paymentStatus.paidAmount > 0)
        ? paymentStatus?.lastPaidOn ?? '待核對'
        : '—'

      return {
        billId: bill.id,
        billingMonth: bill.billingMonth,
        issuedOnText: isIssued ? (formatTaipeiDateTime(bill.issuedAt)?.slice(0, 10) ?? '待核對') : '—',
        amount,
        hasAmount: Number.isSafeInteger(amount) && amount >= 0,
        statusText: !isIssued ? '未出帳' : course
          ? getCoursePaymentStatusText(paymentStatus)
          : getTuitionBillPaymentStatusText(paymentStatus),
        paidOnText,
        detailUrl: `/cramschool/tuition/bills/${bill.id}${isIssued ? '#payment-summary-heading' : ''}`,
        detailText: isIssued ? '查看收款資訊' : '查看草稿'
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
  
  getTuitionPreview: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)

    if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
      return res.status(400).send('課程與學生 ID 必須是正整數')
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const historyPath = `/cramschool/tuition/courses/${courseId}/students/${studentId}`
    const navigation = getTuitionNavigationParams({ billingMonth, page: req.query.page })
    const result = await tuitionService.getTuitionPreview({
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

  getStudentTuitionPreview: async (req, res) => {
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
      tuitionService.getStudentTuitionPreview(input),
      tuitionService.getStudentTuitionBillsForMonth(input)
    ])

    const billRows = (billsResult.rows ?? []).map(bill => ({
      ...bill,
      statusText: bill.status === TUITION_BILL_STATUS.VOID
        ? (bill.issuedAt == null ? '已捨棄草稿' : '已作廢')
        : (bill.status === TUITION_BILL_STATUS.DRAFT ? '草稿' : '已出帳'),
      detailUrl: `/cramschool/tuition/bills/${bill.id}`
    }))
    const activeBill = billRows.find(bill => bill.status === TUITION_BILL_STATUS.DRAFT || bill.status === TUITION_BILL_STATUS.ISSUED) ?? null
    const voidedBills = billRows.filter(bill => bill.status === TUITION_BILL_STATUS.VOID)

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
      ? await tuitionService.getPreviousMonthLeaveReviews({ studentId, billingMonth })
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
    const canCreateDraft = hasSubtotal && !activeBill

    if (canCreateDraft || hasLeaveReviewForm) {
      req.session.tuitionFormToken ??= createSessionFormToken()
    }

    const draftFormToken = canCreateDraft ? req.session.tuitionFormToken : null

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
      activeBill,
      voidedBills,
      draftFormToken,
      draftAction: `/cramschool/tuition/students/${studentId}/bills/draft`,
      courseRows,
      reviewRows,
      leaveReviewPanel,
      errorMessage: result.ok ? null : (messages[result.code] ?? '目前無法試算。')
    })
  },

  postLeaveReview: async (req, res) => {
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
    const result = await tuitionService.recordPreviousMonthLeaveReview({
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
  },

  createTuitionBillDraft: async (req, res) => {
    const studentId = Number(req.params.studentId)
    const { billingMonth, tuitionFormToken } = req.body ?? {}

    if (
      !Number.isSafeInteger(studentId) ||
      studentId < 1 ||
      typeof billingMonth !== 'string' ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)
    ) {
      return res.status(400).send('學生 ID 或計費月份不正確。')
    }

    const expectedToken = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(tuitionFormToken, expectedToken)) {
      return res.status(403).send('表單已失效，請重新開啟合併預覽再試。')
    }

    const result = await tuitionService.createTuitionBillDraft({
      studentId,
      billingMonth
    })

    if (!result.ok) {
      const errors = {
        DRAFT_REQUIRES_REVIEW: '有課程還無法試算，請核對後再儲存草稿。',
        NO_COURSES_IN_BILLING_MONTH: '本月沒有可儲存的課程明細。',
        INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
        UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法儲存。',
        STUDENT_NOT_FOUND: '找不到學生。',
        STUDENT_NAME_UNCONFIRMED: '請先核對學生姓名。',
        COURSE_NAME_UNCONFIRMED: '請先核對課程名稱。',
        INVALID_AMOUNT: '金額超出可儲存的範圍。'
      }

      req.flash('error_messages', errors[result.code] ?? '目前無法儲存草稿。')

      const previewUrl = `/cramschool/tuition/students/${studentId}/preview?` +
        new URLSearchParams({ billingMonth })

      return res.redirect(303, previewUrl)
    }

    req.flash(
      'success_messages',
      result.created ? '已儲存帳單草稿。' : '本月已有帳單，已開啟原單。'
    )

    return res.redirect(303, `/cramschool/tuition/bills/${result.bill.id}`)
  },

  getTuitionBillDetails: async (req, res) => {
    const result = await tuitionService.getTuitionBillDetails(
      Number(req.params.billId)
    )

    if (!result.ok) {
      const invalidId = result.code === 'INVALID_BILL_ID'

      return res.status(invalidId ? 400 : 404)
        .send(invalidId ? '帳單 ID 不正確。' : '找不到這張帳單。')
    }

    const { bill, extraFees, leaveCreditData, canVoidIssuedBill } = result
    const isDraft = bill.status === TUITION_BILL_STATUS.DRAFT
    const hasExtraFeeForm = isDraft && extraFees.length > 0
    const hasLeaveCreditForm = isDraft && leaveCreditData?.ok === true && leaveCreditData.options.length > 0

    if (isDraft || canVoidIssuedBill) {
      req.session.tuitionFormToken ??= createSessionFormToken()
    }

    const extraFeeFormToken = hasExtraFeeForm ? req.session.tuitionFormToken : null

    const discount = bill.items.find(item => item.kind === TUITION_BILL_ITEM_KIND.DISCOUNT)
    const discountForm = isDraft && (bill.totalAmount > 0 || discount)
      ? {
          amount: discount?.unitPrice,
          reason: discount?.reason,
          formToken: req.session.tuitionFormToken
        }
      : null

    const issueForm = isDraft
      ? {
          action: `/cramschool/tuition/bills/${bill.id}/issue`,
          billVersion: bill.version,
          formToken: req.session.tuitionFormToken,
          unappliedCreditCount: hasLeaveCreditForm ? leaveCreditData.options.length : 0,
          leaveCreditSkipKey: hasLeaveCreditForm ? leaveCreditData.optionKey : null
        }
      : null

    const voidForm = canVoidIssuedBill
      ? {
          action: `/cramschool/tuition/bills/${bill.id}/void`,
          billVersion: bill.version,
          formToken: req.session.tuitionFormToken
        }
      : null

    const creditMessages = {
      UTC_REQUIRED: '系統時間設定異常，暫時無法取得折抵。',
      INVALID_BILL_AMOUNT: '草稿金額需要核對。',
      SOURCE_BILL_NOT_FOUND: '找不到上期帳單。',
      BILL_NOT_ISSUED: '原帳單目前不在已出帳狀態。',
      SOURCE_BILL_NOT_FULLY_PAID: '原帳單尚未收清。',
      SOURCE_BILL_HAS_REFUND: '原帳單已有退費，不能再作為請假折抵來源。',
      SOURCE_ITEM_NOT_FOUND: '原帳單沒有這堂課的計費明細。',
      SOURCE_SNAPSHOT_UNCONFIRMED: '原帳單的計費堂次需要核對。',
      SOURCE_LESSON_HAS_NO_CHARGE: '這堂課原本沒有收費。',
      LEAVE_NOT_APPROVED: '請假審核結果已變動，請重新核對。',
      CREDIT_EXCEEDS_DRAFT_TOTAL: '折抵金額超過目前草稿總額。'
    }

    let leaveCreditPanel = null

    if (isDraft && leaveCreditData) {
      if (!leaveCreditData.ok) {
        leaveCreditPanel = {
          errorMessage: creditMessages[leaveCreditData.code] ?? '暫時無法取得折抵清單。'
        }
      } else {
        const blocked = leaveCreditData.blocked.map(row => {
          let statusText = creditMessages[row.code] ?? '請核對原帳單或收款資料。'

          if (row.code === 'LEAVE_CREDIT_ALREADY_IN_USE') {
            statusText = row.usedByBillId === bill.id
              ? '已加入本張草稿。'
              : `已由帳單 #${row.usedByBillId} 使用。`
          }

          return { ...row, statusText }
        })

        leaveCreditPanel = {
          ...leaveCreditData,
          blocked,
          billVersion: bill.version,
          formToken: hasLeaveCreditForm ? req.session.tuitionFormToken : null,
          action: `/cramschool/tuition/bills/${bill.id}/leave-credits`
        }
      }
    }
    const labels = { [TUITION_BILL_STATUS.DRAFT]: '草稿', [TUITION_BILL_STATUS.ISSUED]: '已發單', [TUITION_BILL_STATUS.VOID]: '已作廢' }

    const items = bill.items.map(item => ({
      ...item,
      canRemove: isDraft && [TUITION_BILL_ITEM_KIND.EXTRA_FEE, TUITION_BILL_ITEM_KIND.LEAVE_CREDIT, TUITION_BILL_ITEM_KIND.DISCOUNT].includes(item.kind),
      reviewCount: Array.isArray(item.sourceSnapshot?.reviewItems)
        ? item.sourceSnapshot.reviewItems.length
        : 0
    }))

    const previewUrl = `/cramschool/tuition/students/${bill.StudentId}/preview?` +
      new URLSearchParams({ billingMonth: bill.billingMonth })

    let paymentSummary = null
    let refundSummary = null

    if (bill.status === TUITION_BILL_STATUS.ISSUED) {
      const paymentStatus = result.paymentStatus

      if (paymentStatus?.ok === true) {
        const { totalAmount, paidAmount, remainingAmount } = paymentStatus
        const statusText = getTuitionBillPaymentStatusText(paymentStatus)

        paymentSummary = { totalAmount, paidAmount, remainingAmount, statusText }
        const allocation = result.paymentAllocation
        if (allocation?.ok && allocation.itemized) {
          const canRecord = remainingAmount > 0
          if (canRecord) req.session.tuitionFormToken ??= createSessionFormToken()
          paymentSummary.itemizedPayment = {
            canRecord,
            action: `/cramschool/tuition/bills/${bill.id}/payments`,
            formToken: canRecord ? req.session.tuitionFormToken : null,
            billVersion: bill.version,
            hasAdjustments: allocation.hasAdjustments,
            items: allocation.items.map(item => ({
              ...item,
              canSelect: canRecord && item.amount > 0 && item.paymentId === null,
              statusText: item.paymentId !== null ? `已收款（#${item.paymentId}）`
                : item.amount === 0 ? '已折抵' : '未收款'
            }))
          }
        } else if (allocation?.ok === false) {
          paymentSummary.allocationMessage = '分項收款紀錄需要核對，暫時不能再登記收款。'
        } else if (remainingAmount > 0 && remainingAmount <= 2_147_483_647) {
          req.session.tuitionFormToken ??= createSessionFormToken()
          paymentSummary.allocationMessage = allocation?.reason === 'LEGACY_UNALLOCATED_PAYMENT'
            ? '先前收款沒有記錄對應項目，剩餘金額可整筆登記。'
            : '這張帳單的明細無法拆分，剩餘金額可整筆登記。'
          paymentSummary.paymentForm = {
            action: `/cramschool/tuition/bills/${bill.id}/payments`,
            amount: remainingAmount,
            billVersion: bill.version,
            formToken: req.session.tuitionFormToken
          }
        }
      } else {
        const paymentMessages = {
          INVALID_BILL_AMOUNT: '帳單金額需要核對。',
          PAYMENT_LINK_CONFLICT: '收款同時連到新舊帳單，請核對。',
          INVALID_PAYMENT_AMOUNT: '收款紀錄的金額需要核對。',
          PAYMENT_TOTAL_EXCEEDS_BILL: '收款總額超過帳單金額，請核對。'
        }

        paymentSummary = {
          statusText: '待核對',
          errorMessage: paymentMessages[paymentStatus?.code] ?? '暫時無法確認收款資料，請重新開啟帳單。'
        }
      }
    }

    const refund = result.refundSummary
    if (refund) {
      if (!refund.ok) {
        refundSummary = { errorMessage: REFUND_MESSAGES[refund.code] ?? '暫時無法核對退費資料。' }
      } else {
        refundSummary = {
          ...refund,
          blockedMessage: REFUND_MESSAGES[refund.blockedCode],
          statusText: refund.refundedAmount === 0
            ? '尚未退費'
            : refund.netPaidAmount === 0 ? '已全額退費' : '已部分退費'
        }
        if (refund.netPaidAmount > 0 && !refund.blockedCode) {
          req.session.tuitionFormToken ??= createSessionFormToken()
          refundSummary.form = {
            action: `/cramschool/tuition/bills/${bill.id}/refunds`,
            formToken: req.session.tuitionFormToken,
            billVersion: bill.version,
            maxAmount: Math.min(refund.netPaidAmount, 2_147_483_647),
            earliestDate: result.paymentStatus.lastPaidOn,
            today: getTaipeiDate()
          }
        }
      }
    }

    res.set('Cache-Control', 'no-store')

    return res.render('tuition/bill-detail', {
      bill,
      items,
      statusText: labels[bill.status] ?? '待核對',
      paymentSummary,
      refundSummary,
      paymentNotice: buildTuitionPaymentNotice(bill, result.paymentStatus),
      billHistory: buildTuitionBillHistory(result.history),
      previewUrl,
      isDraft, 
      discountForm,
      leaveCreditPanel,
      issueForm,
      voidForm,
      extraFees, 
      extraFeeFormToken
    })
  },

  addTuitionBillExtraFee: async (req, res) => {
    const billId = Number(req.params.billId)
    if (!Number.isSafeInteger(billId) || billId < 1) {
      return res.status(400).send('帳單 ID 不正確。')
    }

    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const result = await tuitionService.addTuitionBillExtraFee({
      billId,
      extraFeeId: readInt(body.extraFeeId),
      quantity: readInt(body.quantity),
      billVersion: readInt(body.billVersion)
    })

    if (result.code === 'BILL_NOT_FOUND') {
      return res.status(404).send('找不到這張帳單。')
    }

    const errors = {
      INVALID_INPUT: '請選擇費用項目，數量須為 1 到 999 的整數。',
      BILL_NOT_DRAFT: '只有草稿可以加入額外費用。',
      BILL_VERSION_CONFLICT: '帳單已更新，請核對目前明細後再試。',
      EXTRA_FEE_ALREADY_ADDED: '這個費用項目已經在帳單上。',
      EXTRA_FEE_UNAVAILABLE: '這個費用項目目前無法使用。',
      INVALID_AMOUNT: '加入後的總額超出可儲存的範圍。'
    }

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? '已加入額外費用。' : errors[result.code] ?? '無法加入額外費用。'
    )

    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  setTuitionBillDraftDiscount: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN
    const billId = readInt(req.params.billId)
    const result = await tuitionService.setTuitionBillDraftDiscount({
      billId,
      billVersion: readInt(body.billVersion),
      actorId: req.user.id,
      amount: readInt(body.amount),
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send('帳單 ID 或草稿版本不正確，請重新開啟帳單再試。')
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return res.status(404).send('找不到這張帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以修改帳單折扣。',
      BILL_VERSION_CONFLICT: '帳單已更新，請核對目前明細後再試。',
      BILL_HAS_NO_ITEMS: '草稿沒有明細，請先核對。',
      INVALID_BILL_AMOUNT: '草稿明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不符，請先核對。',
      INVALID_DISCOUNT_AMOUNT: '折扣金額須為大於 0 且在可儲存範圍內的台幣整數。',
      INVALID_DISCOUNT_REASON: '請填寫折扣原因，最多 255 字元。',
      DISCOUNT_EXCEEDS_DRAFT_TOTAL: '折扣後的應收金額不能低於 NT$ 0。',
      DISCOUNT_REQUIRES_REVIEW: '草稿裡已有需要核對的折扣明細。',
      INVALID_AMOUNT: '折扣後的總額超出可儲存範圍。'
    }
    const message = result.ok
      ? (result.changed ? '已儲存帳單折扣，請核對更新後的金額。' : '折扣沒有變動。')
      : errors[result.code] ?? '暫時無法儲存帳單折扣。'

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  addLeaveCreditToDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const billId = readInt(req.params.billId)
    if (!Number.isSafeInteger(billId) || billId < 1) {
      return res.status(400).send('帳單 ID 不正確。')
    }

    const result = await tuitionService.addLeaveCreditToDraft({
      billId,
      attendId: readInt(body.attendId),
      billVersion: readInt(body.billVersion)
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send('折抵資料格式不正確，請重新開啟帳單再試。')
    }

    if (result.code === 'BILL_NOT_FOUND') {
      return res.status(404).send('找不到要核對的帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以加入折抵。',
      BILL_VERSION_CONFLICT: '草稿已更新，請核對目前明細後再試。',
      LEAVE_UNAVAILABLE: '找不到這筆可折抵的請假紀錄。',
      LEAVE_NOT_APPROVED: '這筆請假尚未核准，或點名更正後需要重審。',
      BILL_NOT_ISSUED: '原帳單目前不在已出帳狀態。',
      SOURCE_BILL_NOT_FOUND: '找不到上期原帳單。',
      SOURCE_BILL_AMBIGUOUS: '找到多張上期帳單，請先核對原單。',
      SOURCE_ITEM_NOT_FOUND: '原帳單沒有這堂課的計費明細。',
      SOURCE_ITEM_AMBIGUOUS: '這堂課對到多筆原明細，請先核對。',
      SOURCE_SNAPSHOT_UNCONFIRMED: '上期帳單的計費堂次需要核對。',
      SOURCE_LESSON_HAS_NO_CHARGE: '這堂課原本沒有收費。',
      SOURCE_BILL_NOT_FULLY_PAID: '原帳單尚未收清，暫時不能折抵。',
      SOURCE_BILL_HAS_REFUND: '原帳單已有退費，不能再作為請假折抵來源。',
      PAYMENT_LINK_CONFLICT: '原帳單的收款連結需要核對。',
      INVALID_PAYMENT_AMOUNT: '原帳單的收款金額需要核對。',
      PAYMENT_TOTAL_EXCEEDS_BILL: '原帳單的收款超過帳單金額，請先核對。',
      CREDIT_SOURCE_CHANGED: '折抵來源已變動，請重新核對。',
      INVALID_BILL_AMOUNT: '帳單金額需要核對。',
      CREDIT_EXCEEDS_DRAFT_TOTAL: '折抵金額超過目前草稿總額。',
      LEAVE_CREDIT_VALIDATION_FAILED: '折抵明細未通過資料檢查。'
    }

    let message = errors[result.code] ?? '暫時無法加入折抵。'

    if (result.ok) {
      message = '已加入請假折抵。'
    } else if (result.code === 'LEAVE_CREDIT_ALREADY_IN_USE') {
      message = `這筆請假已由帳單 #${result.usedByBillId} 使用。`
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  getStudentTuitionList: async (req, res) => {
    const listUrl = '/cramschool/tuition/students'
    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const statusFilter = req.query.status ?? 'all'
    const page = Number(req.query.page ?? 1)
    const pageSize = 12

    const viewData = {
      listUrl,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      statusOptions: Object.entries(STUDENT_TUITION_STATUS).map(([value, label]) => ({
        value, label, selected: value === statusFilter
      }))
    }

    res.set('Cache-Control', 'no-store')
    const result = await tuitionService.getStudentTuitionList({
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
      const { bill, paymentStatus } = row
      const isIssued = bill?.status === TUITION_BILL_STATUS.ISSUED
      const amount = bill ? bill.totalAmount : row.baseSubtotal
      const hasAmount = Number.isSafeInteger(amount) && amount >= 0
      const hasRemainingAmount = isIssued && paymentStatus?.ok === true
      let statusText = '未開單'

      if (isIssued) {
        statusText = getTuitionBillPaymentStatusText(paymentStatus)
      } else if (bill) {
        statusText = hasAmount ? '草稿' : '草稿待核對'
      } else if (row.code === 'NO_COURSES_IN_BILLING_MONTH') {
        statusText = '本月無有效選課'
      } else if (row.reviewCount > 0) {
        statusText = `試算待核對（${row.reviewCount} 項）`
      } else if (row.code || !hasAmount) {
        statusText = '試算待核對'
      }

      return {
        student: row.student,
        amount,
        hasAmount,
        amountSourceText: isIssued ? '正式帳單' : (bill ? '草稿金額' : '基本學費試算'),
        statusText,
        hasRemainingAmount,
        remainingAmount: hasRemainingAmount ? paymentStatus.remainingAmount : null,
        billUrl: bill ? `/cramschool/tuition/bills/${bill.id}` : null,
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

  getCourseMonthlyTuitionList: async (req, res) => {
    const courseId = Number(req.params.courseId)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數。')
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const page = Number(req.query.page ?? 1)
    const pageSize = 12
    const listUrl = `/cramschool/tuition/courses/${courseId}/monthly`
    const viewData = {
      listUrl,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      backUrl: withQuery('/cramschool/payment', getTuitionNavigationParams({ billingMonth }))
    }

    res.set('Cache-Control', 'no-store')
    const result = await tuitionService.getCourseMonthlyTuitionList({ courseId, billingMonth, page, pageSize })
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

    const monthQuery = new URLSearchParams({ billingMonth })
    const historyQuery = getTuitionNavigationParams({ billingMonth, page })
    const rows = result.rows.map(({ studentId, student, bill, enrollmentNeedsReview, hasCourseFee, courseAmount, coursePayment }) => {
      const isIssuedForCourse = hasCourseFee && bill?.status === TUITION_BILL_STATUS.ISSUED
      const hasAmount = Number.isSafeInteger(courseAmount) && courseAmount >= 0
      const amountText = amount => `NT$ ${amountFormat.format(amount)}`
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
        studentName: student?.name ?? bill?.studentNameSnapshot ?? `學生 #${studentId}`,
        statusText,
        amountText: hasAmount ? amountText(courseAmount) : hasCourseFee ? '待核對' : '—',
        receivedText: !isIssuedForCourse ? '—' : coursePayment?.ok ? amountText(coursePayment.paidAmount) : '待核對',
        remainingText: !isIssuedForCourse ? '—' : coursePayment?.ok ? amountText(coursePayment.remainingAmount) : '待核對',
        billUrl: bill ? `/cramschool/tuition/bills/${bill.id}` : null,
        historyUrl: student
          ? withQuery(`/cramschool/tuition/courses/${courseId}/students/${studentId}`, historyQuery)
          : null,
        previewUrl: student ? `/cramschool/tuition/students/${studentId}/preview?${monthQuery}` : null
      }
    })

    return res.render('tuition/course-monthly-list', {
      ...viewData,
      course: result.course,
      rows,
      totalCount: result.totalCount,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  issueTuitionBill: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const billId = readInt(req.params.billId)
    if (!Number.isSafeInteger(billId) || billId < 1) {
      return res.status(400).send('帳單 ID 不正確。')
    }

    const result = await tuitionService.issueTuitionBill({
      billId,
      billVersion: readInt(body.billVersion),
      actorId: req.user.id,
      leaveCreditSkipKey: body.leaveCreditSkipKey,
      leaveCreditSkipReason: body.leaveCreditSkipReason
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send('出帳資料格式不正確，請重新開啟帳單再試。')
    }

    if (result.code === 'BILL_NOT_FOUND') {
      return res.status(404).send('找不到這張帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以正式出帳。',
      BILL_VERSION_CONFLICT: '草稿已更新，請核對目前明細後再出帳。',
      BILL_HAS_NO_ITEMS: '帳單沒有明細，暫時不能出帳。',
      INVALID_BILL_AMOUNT: '帳單明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不一致，請先核對。',
      DRAFT_COURSE_FEES_REQUIRE_REVIEW: '草稿的課程明細已變動或無法核對，請回到同月合併預覽查看最新試算。',
      DISCOUNT_REQUIRES_REVIEW: '草稿裡有帳單折扣需要核對，暫時不能出帳。',
      LEAVE_REVIEW_UNAVAILABLE: '目前無法核對上月請假，暫時不能出帳。',
      LEAVE_CREDIT_REQUIRES_REVIEW: '草稿裡有折抵需要重新核對，暫時不能出帳。',
      LEAVE_CREDIT_OPTIONS_CHANGED: '可折抵項目已變更，請核對重新載入的明細後再出帳。',
      INVALID_LEAVE_CREDIT_SKIP_REASON: '請填寫本張帳單不折抵的原因，最多 255 字元。'
    }

    let message = errors[result.code] ?? '暫時無法正式出帳。'

    if (result.ok) {
      message = result.changed ? '已正式出帳。' : '這張帳單已經出帳。'
    } else if (result.code === 'PENDING_LEAVE_REVIEWS') {
      message = `上月還有 ${result.pendingCount} 筆請假待審核，請回到合併預覽處理後再出帳。`
    } else if (result.code === 'UNAPPLIED_LEAVE_CREDITS') {
      message = `還有 ${result.creditCount} 筆可加入的請假折抵，請加入折抵或確認本張不折抵後再出帳。`
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  refreshTuitionBillDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const billId = readInt(req.params.billId)
    const billVersion = readInt(body.billVersion)
    const invalidInput = '帳單 ID 或草稿版本不正確，請重新開啟帳單再試。'

    if (
      !Number.isSafeInteger(billId) || billId < 1 ||
      !Number.isSafeInteger(billVersion) || billVersion < 0
    ) {
      return res.status(400).send(invalidInput)
    }

    const result = await tuitionService.refreshTuitionBillDraft({
      billId,
      billVersion,
      actorId: req.user.id
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send(invalidInput)
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return res.status(404).send('找不到這張帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以更新課程明細。',
      BILL_VERSION_CONFLICT: '草稿已變更，請核對重新載入的帳單後再試。',
      STUDENT_NOT_FOUND: '找不到學生資料，無法更新草稿。',
      BILL_HAS_NO_ITEMS: '草稿沒有明細，請先核對。',
      INVALID_BILL_AMOUNT: '草稿明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不符，請先核對。',
      INVALID_BILLING_MONTH: '帳單的計費月份需要核對。',
      UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法更新。',
      DRAFT_REQUIRES_REVIEW: '仍有課程資料待核對，請回到同月合併預覽確認。',
      NO_COURSES_IN_BILLING_MONTH: '本月沒有可建立明細的課程，草稿未更新。',
      COURSE_NAME_UNCONFIRMED: '課程名稱需要核對，草稿未更新。',
      INVALID_AMOUNT: '更新後的金額超出可儲存範圍，草稿未更新。',
      DRAFT_CREDITS_EXCEED_UPDATED_TOTAL: '更新後的金額不足以扣除原有折抵或折扣，草稿未更新。'
    }

    const message = result.ok
      ? (result.changed ? '已更新課程明細，請核對金額後再出帳。' : '課程明細沒有變動，草稿維持原樣。')
      : errors[result.code] ?? '暫時無法更新草稿。'

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  removeTuitionBillDraftAdjustment: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const billId = readInt(req.params.billId)
    const billItemId = readInt(req.params.billItemId)
    const billVersion = readInt(body.billVersion)
    const invalidInput = '帳單、明細 ID 或草稿版本不正確，請重新開啟帳單再試。'

    if (
      ![billId, billItemId].every(id => Number.isSafeInteger(id) && id > 0) ||
      !Number.isSafeInteger(billVersion) || billVersion < 0
    ) {
      return res.status(400).send(invalidInput)
    }

    const result = await tuitionService.removeTuitionBillDraftAdjustment({
      billId,
      billItemId,
      billVersion,
      actorId: req.user.id
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send(invalidInput)
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return res.status(404).send('找不到這張帳單。')
    }

    const errors = {
      BILL_NOT_DRAFT: '只有草稿可以移除額外費用、折抵或折扣。',
      BILL_VERSION_CONFLICT: '草稿已變更，請核對重新載入的帳單後再試。',
      BILL_ITEM_NOT_FOUND: '找不到這張帳單的該筆明細，可能已經移除。',
      BILL_ITEM_NOT_REMOVABLE: '只能移除額外費用、請假折抵或帳單折扣。課程費用請使用「更新草稿」。',
      INVALID_BILL_AMOUNT: '草稿明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不符，請先核對。',
      INVALID_AMOUNT: '移除後的金額超出可儲存範圍，草稿未變更。',
      DRAFT_CREDITS_EXCEED_UPDATED_TOTAL: '移除後的金額不足以扣除原有折抵或折扣，草稿未變更。'
    }

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok ? '已移除這筆明細，請核對更新後的金額。' : errors[result.code] ?? '暫時無法移除明細。'
    )
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  discardTuitionBillDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const billId = readInt(req.params.billId)
    const billVersion = readInt(body.billVersion)
    const invalidInput = '帳單 ID 或草稿版本不正確，請重新開啟帳單再試。'

    if (
      !Number.isSafeInteger(billId) || billId < 1 ||
      !Number.isSafeInteger(billVersion) || billVersion < 0
    ) {
      return res.status(400).send(invalidInput)
    }

    const result = await tuitionService.discardTuitionBillDraft({
      billId,
      billVersion,
      actorId: req.user.id,
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') {
      return res.status(400).send(invalidInput)
    }
    if (result.code === 'BILL_NOT_FOUND') {
      return res.status(404).send('找不到這張帳單。')
    }

    const errors = {
      INVALID_DISCARD_REASON: '請填寫捨棄草稿的原因，最多 255 字元。',
      BILL_NOT_DRAFT: '只有尚未出帳的草稿可以捨棄。',
      BILL_VERSION_CONFLICT: '草稿已變更，請核對重新載入的帳單後再試。',
      DRAFT_HAS_PAYMENT: '這張草稿已有收款紀錄，請先核對。草稿未捨棄。',
      LEAVE_CREDIT_REQUIRES_REVIEW: '有請假折抵來源需要核對，草稿未捨棄。'
    }

    const message = result.ok
      ? (result.changed ? '已捨棄草稿，原帳單紀錄已保留。' : '這張草稿已經捨棄，沒有重複處理。')
      : errors[result.code] ?? '暫時無法捨棄草稿。'

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  voidIssuedTuitionBill: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    if (!isValidSessionFormToken(token, expected)) {
      return res.status(403).send('表單已失效，請重新開啟帳單再試。')
    }

    const readInt = value =>
      typeof value === 'string' && value !== '' && !/\D/.test(value)
        ? Number(value)
        : NaN

    const billId = readInt(req.params.billId)
    const billVersion = readInt(body.billVersion)
    const invalidInput = '帳單 ID 或版本不正確，請重新開啟帳單再試。'

    if (
      !Number.isSafeInteger(billId) || billId < 1 ||
      !Number.isSafeInteger(billVersion) || billVersion < 0
    ) {
      return res.status(400).send(invalidInput)
    }

    const result = await tuitionService.voidIssuedTuitionBill({
      billId,
      billVersion,
      actorId: req.user.id,
      reason: body.reason
    })

    if (result.code === 'INVALID_INPUT') return res.status(400).send(invalidInput)
    if (result.code === 'BILL_NOT_FOUND') return res.status(404).send('找不到這張帳單。')

    const errors = {
      INVALID_VOID_REASON: '請填寫作廢原因，最多 255 字元。',
      BILL_NOT_ISSUED: '這張帳單目前無法作廢，請核對帳單狀態。',
      BILL_VERSION_CONFLICT: '帳單已變更，請核對重新載入的明細後再試。',
      BILL_HAS_PAYMENT: '這張帳單已有收款紀錄，帳單未作廢。',
      LEAVE_CREDIT_REQUIRES_REVIEW: '有請假折抵來源需要核對，帳單未作廢。'
    }

    const message = result.ok
      ? (result.changed ? '已作廢帳單，原明細已保留。' : '這張帳單已作廢，本次沒有重複處理。')
      : errors[result.code] ?? '暫時無法作廢帳單。'

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },
}

module.exports = tuitionController