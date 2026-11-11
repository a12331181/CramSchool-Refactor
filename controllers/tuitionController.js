const db = require('../models')
const Tuition = db.Tuition
const Course = db.Course
const Student = db.Student
const FeeList = db.FeeList
const ExtraFee = db.ExtraFee
const Payment = db.Payment
const moment = require('moment')
const calendarService = require('../services/calendarService')
const tuitionService = require('../services/tuitionService')
const { getTaipeiDate } = require('../utils/date')
const { getPagination } = require('../utils/pagination')
const { randomBytes, timingSafeEqual } = require('node:crypto')
const ATTEND_STATUS = require('../constants/attendStatus')
const NO_LEGACY_PERIOD_MESSAGE =
  '這門課程沒有原有期數，無法使用按期建立學費表。'

const tuitionController = {
  getCourseTuitionList: (req, res) => {
    Promise.all([
      Tuition.findAll({
        raw: true,
        nest: true,
        include: [Payment],
        where: { StudentId: req.params.studentId, CourseId: req.params.courseId },
      }),
      Course.findOne({
        where: { id: req.params.courseId, isActive: true }
      }),
      Student.findOne({
        where: { id: req.params.studentId, status: 1 }
      })
    ]).then(([tuitions, course, student]) => {
      if (course === null || student === null) {
        console.log('Not found!')
        res.redirect('/cramschool/payment')
      } else {
        let tuitionNotExist = false
        if (tuitions.length === 0) {
          tuitionNotExist = true
        }
        return res.render('tuition', {
          tuitions: tuitions,
          course: course.toJSON(),
          student: student.toJSON(),
          tuitionNotExist: tuitionNotExist
        })
      }
    })
  },
  
  getTuitionPreview: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)

    if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
      return res.status(400).send('課程與學生 ID 必須是正整數')
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const listUrl = `/cramschool/tuition/courses/${courseId}/students/${studentId}`
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
      [ATTEND_STATUS.PRESENT]: '出席',
      [ATTEND_STATUS.ABSENT]: '缺席',
      [ATTEND_STATUS.EXCUSED]: '請假',
      [ATTEND_STATUS.UNMARKED]: '未點名',
      not_due: '尚未到結束時間',
      requires_review: '待核對'
    }

    const attendanceItems = result.ok
      ? result.attendanceSummary.items.map(item => ({
          ...item,
          statusText: attendanceLabels[item.status] ?? '待核對'
        }))
      : []

    return res.render('tuitionpreview', {
      listUrl,
      previewUrl: `${listUrl}/preview`,
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
    const result = await tuitionService.getStudentTuitionPreview({
      studentId,
      billingMonth
    })

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

    if (hasSubtotal || hasLeaveReviewForm) {
      req.session.tuitionFormToken ??= randomBytes(32).toString('hex')
    }

    const draftFormToken = hasSubtotal ? req.session.tuitionFormToken : null

    const leaveReviewPanel = leaveData && {
      ...leaveData,
      rows: leaveRows,
      billingMonth,
      formToken: hasLeaveReviewForm ? req.session.tuitionFormToken : null,
      actionBase: `/cramschool/tuition/students/${studentId}/leave-reviews`
    }

    res.set('Cache-Control', 'no-store')
    return res.render('studenttuitionpreview', {
      previewUrl: `/cramschool/tuition/students/${studentId}/preview`,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      preview: result.ok ? result : null,
      hasSubtotal,
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
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
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
    const isToken = value =>
      typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

    if (
      !isToken(tuitionFormToken) ||
      !isToken(expectedToken) ||
      !timingSafeEqual(
        Buffer.from(tuitionFormToken, 'hex'),
        Buffer.from(expectedToken, 'hex')
      )
    ) {
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

    const { bill, extraFees, leaveCreditData } = result
    const isDraft = bill.status === 'draft'
    const hasExtraFeeForm = isDraft && extraFees.length > 0
    const hasLeaveCreditForm = isDraft && leaveCreditData?.ok === true && leaveCreditData.options.length > 0

    if (isDraft) {
      req.session.tuitionFormToken ??= randomBytes(32).toString('hex')
    }

    const extraFeeFormToken = hasExtraFeeForm ? req.session.tuitionFormToken : null

    const issueForm = isDraft
      ? {
          action: `/cramschool/tuition/bills/${bill.id}/issue`,
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
    const labels = { draft: '草稿', issued: '已發單', void: '已作廢' }

    const items = bill.items.map(item => ({
      ...item,
      canRemove: isDraft && ['extra_fee', 'leave_credit'].includes(item.kind),
      reviewCount: Array.isArray(item.sourceSnapshot?.reviewItems)
        ? item.sourceSnapshot.reviewItems.length
        : 0
    }))

    const previewUrl = `/cramschool/tuition/students/${bill.StudentId}/preview?` +
      new URLSearchParams({ billingMonth: bill.billingMonth })

    res.set('Cache-Control', 'no-store')

    return res.render('tuitionbilldetail', {
      bill,
      items,
      statusText: labels[bill.status] ?? '待核對',
      previewUrl,
      isDraft, 
      leaveCreditPanel,
      issueForm,
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
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
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

  addLeaveCreditToDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
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
    const page = Number(req.query.page ?? 1)
    const pageSize = 12

    const viewData = {
      listUrl,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : ''
    }

    const result = await tuitionService.getStudentTuitionList({
      billingMonth,
      page,
      pageSize
    })

    if (!result.ok) {
      const errors = {
        INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
        INVALID_PAGE: '頁碼不正確。',
        UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法試算。'
      }

      return res.render('studenttuitionlist', {
        ...viewData,
        errorMessage: errors[result.code] ?? '目前無法取得學生學費列表。'
      })
    }

    const pagination = getPagination({
      page,
      pageSize,
      totalCount: result.totalCount
    })

    const pageUrl = targetPage => `${listUrl}?${new URLSearchParams({
      billingMonth,
      page: String(targetPage)
    })}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    const rows = result.rows.map(row => {
      const hasSubtotal = Number.isSafeInteger(row.baseSubtotal)
      let statusText = '已試算'

      if (row.code === 'NO_COURSES_IN_BILLING_MONTH') {
        statusText = '本月無有效選課'
      } else if (row.reviewCount > 0) {
        statusText = `待核對（${row.reviewCount} 項）`
      } else if (row.code || !hasSubtotal) {
        statusText = '待核對'
      }

      return {
        ...row,
        hasSubtotal,
        statusText,
        previewUrl: `${listUrl}/${row.student.id}/preview?${new URLSearchParams({
          billingMonth
        })}`
      }
    })

    return res.render('studenttuitionlist', {
      ...viewData,
      rows,
      totalCount: result.totalCount,
      pagination,
      prevUrl: page > 1 ? pageUrl(pagination.prev) : null,
      nextUrl: page < pagination.totalPages ? pageUrl(pagination.next) : null
    })
  },

  issueTuitionBill: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
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
      actorId: req.user.id
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
      LEAVE_REVIEW_UNAVAILABLE: '目前無法核對上月請假，暫時不能出帳。',
      LEAVE_CREDIT_REQUIRES_REVIEW: '草稿裡有折抵需要重新核對，暫時不能出帳。'
    }

    let message = errors[result.code] ?? '暫時無法正式出帳。'

    if (result.ok) {
      message = result.changed ? '已正式出帳。' : '這張帳單已經出帳。'
    } else if (result.code === 'PENDING_LEAVE_REVIEWS') {
      message = `上月還有 ${result.pendingCount} 筆請假待審核，請回到合併預覽處理後再出帳。`
    }

    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(303, `/cramschool/tuition/bills/${billId}`)
  },

  refreshTuitionBillDraft: async (req, res) => {
    const body = req.body ?? {}
    const token = body.tuitionFormToken
    const expected = req.session?.tuitionFormToken
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
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
      DRAFT_CREDITS_EXCEED_UPDATED_TOTAL: '更新後的金額不足以扣抵原有折抵，請先核對。草稿未更新。'
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
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
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
      BILL_NOT_DRAFT: '只有草稿可以移除費用或折抵。',
      BILL_VERSION_CONFLICT: '草稿已變更，請核對重新載入的帳單後再試。',
      BILL_ITEM_NOT_FOUND: '找不到這張帳單的該筆明細，可能已經移除。',
      BILL_ITEM_NOT_REMOVABLE: '只能移除額外費用或請假折抵。課程費用請使用「更新草稿」。',
      INVALID_BILL_AMOUNT: '草稿明細的金額需要核對。',
      DRAFT_TOTAL_MISMATCH: '草稿總額與明細合計不符，請先核對。',
      INVALID_AMOUNT: '移除後的金額超出可儲存範圍，草稿未變更。',
      DRAFT_CREDITS_EXCEED_UPDATED_TOTAL: '移除後的金額不足以扣抵原有折抵，請先核對。草稿未變更。'
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
    const isToken = value =>
      typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

    if (
      !isToken(token) || !isToken(expected) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    ) {
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

  createTuition: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)

    if (
      !Number.isSafeInteger(courseId) || courseId < 1 ||
      !Number.isSafeInteger(studentId) || studentId < 1
    ) {
      return res.status(400).send('課程與學生 ID 必須是正整數')
    }

    const [calendarPeriod, course] = await Promise.all([
      calendarService.getLatestLegacyPeriod(courseId),
      Course.findOne({
        where: { id: courseId, isActive: true },
        attributes: ['id', 'price'],
        raw: true
      })
    ])

    if (!course) {
      req.flash('error_messages', '找不到可建立學費表的課程')
      return res.redirect(303, '/cramschool/payment')
    }

    const url = `/cramschool/tuition/courses/${course.id}/students/${studentId}`

    if (calendarPeriod === null) {
      req.flash('error_messages', NO_LEGACY_PERIOD_MESSAGE)
      return res.redirect(303, url)
    }

    const currentPeriod = await Tuition.max('period', {
      where: { CourseId: course.id, StudentId: studentId }
    })

    if ((currentPeriod ?? 0) >= calendarPeriod) {
      req.flash('error_messages', '已有最新一期的學費表')
      return res.redirect(303, url)
    }

    await Tuition.create({
      amounts: course.price,
      CourseId: course.id,
      StudentId: studentId,
      period: calendarPeriod
    })

    req.flash('success_messages', '已成功建立收費表')
    return res.redirect(303, url)
  },

  createTuitions: async (req, res) => {
    const courseId = Number(req.params.id)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const [calendarPeriod, course] = await Promise.all([
      calendarService.getLatestLegacyPeriod(courseId),
      Course.findOne({
        where: { id: courseId, isActive: true },
        attributes: ['id', 'price'],
        include: [{
          model: Student,
          as: 'EnrolledStudents',
          attributes: ['id'],
          where: { status: 1 },
          required: false,
          through: { attributes: [] }
        }]
      })
    ])

    if (!course) {
      req.flash('error_messages', '找不到可建立學費表的課程')
      return res.redirect(303, '/cramschool/payment')
    }

    const url = `/cramschool/payment/courses/${course.id}`

    if (calendarPeriod === null) {
      req.flash('error_messages', NO_LEGACY_PERIOD_MESSAGE)
      return res.redirect(303, url)
    }

    const students = course.EnrolledStudents

    if (students.length === 0) {
      req.flash('error_messages', '這門課程目前沒有可建立學費表的學生')
      return res.redirect(303, url)
    }

    let createdCount = 0

    for (const student of students) {
      const currentPeriod = await Tuition.max('period', {
        where: { CourseId: course.id, StudentId: student.id }
      })

      if ((currentPeriod ?? 0) < calendarPeriod) {
        await Tuition.create({
          amounts: course.price,
          CourseId: course.id,
          StudentId: student.id,
          period: calendarPeriod
        })

        createdCount += 1
      }
    }

    if (createdCount > 0) {
      req.flash('success_messages', `已成功建立 ${createdCount} 筆收費表`)
    } else {
      req.flash('error_messages', '學生皆已有最新一期的學費表')
    }

    return res.redirect(303, url)
  },

  editTuition: (req, res) => {
    Promise.all([
      ExtraFee.findAll({
        raw: true,
        nest: true
      }),
      Tuition.findOne({
        where: { id :req.params.id },
        include: [Course]
      }),
      Tuition.findByPk(req.params.id, {
        include: [{ model: ExtraFee, as: 'RequiredFee' }],
      }),
      Tuition.findByPk(req.params.id, {
        raw: true,
        nest: true,
        include: [Student]
      }),
    ]).then(([extrafees, tuition, tuitionFees, tuitionStudent]) => {
      if (tuition === null) {
        console.log('Not found!')
        res.redirect('/cramschool/payment')
      } else {
        const data = extrafees.map(r => ({
          ...r,
          isExisted: !tuitionFees.RequiredFee.map(d => d.id).includes(r.id)
        }))
        let total = tuition.Course.price
        let fees = tuitionFees.RequiredFee.map(r => r.dataValues)
        for (let i = 0; i < data.length; i++) {
          if (data[i].isExisted === false) {
            total += data[i].price
          }
        }
        Tuition.findByPk(req.params.id).then(editamounts => {
          editamounts.update({
            amounts: total
          })
        }).then(() => {
          return res.render('edittuition', { 
            extrafees: data,
            tuition: tuition.toJSON(),
            tuitionFees: fees,
            total: total,
            tuitionStudent: tuitionStudent
          })
        }) 
      }
    })
  },

  addFeeList: (req, res) => {
    FeeList.create({
      ExtraFeeId: req.params.extrafeeId,
      TuitionId: req.params.tuitionId
    }).then((feelist) => {
      req.flash('success_messages', '成功新增額外費用')
      return res.redirect('back')
    })
  },

  removeFeeList: (req, res) => {
    FeeList.destroy({
      where: {
        ExtraFeeId: req.params.extrafeeId,
        TuitionId: req.params.tuitionId
      }
    }).then(() => {
      req.flash('success_messages', '成功刪除額外費用')
      return res.redirect('back')
    })
  },

  confirmTuitionAndCreatePayment: (req, res) => {
    FeeList.findAll({
      where: { 
        TuitionId: req.params.id
      }
    }).then(feelists => {
      for (let i = 0; i < feelists.length; i++ ) {
        ExtraFee.findByPk(feelists[i].dataValues.ExtraFeeId, {
          raw: true,
          nest: true
        }).then(extrafee => {
          feelists[i].update({
            price: extrafee.price
          })
        })
      }
    }).then(() => {
      Tuition.findByPk(req.params.id, {include: [Course]}).then(tuition => {
        Promise.all([
          tuition.update({
            course_price: tuition.dataValues.Course.dataValues.price
          }),
          Payment.create({
            time: moment().format('YYYY-MM-DD'),
            amount: tuition.dataValues.amounts, 
            isPaid: false,
            TuitionId: tuition.id,
            currentPeriod: tuition.dataValues.period
          })
        ]).then(()=> {
          let url = '/cramschool/tuition/courses/'+ String(tuition.dataValues.CourseId) + '/students/' + String(tuition.dataValues.StudentId)
          req.flash('success_messages', '成功新增學費表與費用紀錄')
          return res.redirect(url)
        })
      })
    })
  },
  
  getTuition: (req, res) => {
    Promise.all([
      Tuition.findByPk(req.params.id, {
        include: [{ model: ExtraFee, as: 'RequiredFee'}]
      }),
      Tuition.findByPk(req.params.id, {
        raw: true,
        nest: true,
        include: [Course]
      }),
      Tuition.findByPk(req.params.id, {
        raw: true,
        nest: true,
        include: [Student]
      }),
      Tuition.findByPk(req.params.id, {
        raw: true,
        nest: true,
        include: [Payment]
      })
    ]).then(([tuition, tuitionCourse, tuitionStudent, tuitionPayment]) => {
      if (tuition === null) {
        return res.redirect('/cramschool/payment')
      } else if (tuitionPayment.Payment.id === null ) {
        return res.redirect('/cramschool/payment')
      } else {
        return res.render('tuitiondetail', {
          tuition: tuition,
          tuitionCourse: tuitionCourse,
          tuitionStudent: tuitionStudent
        })
      }
    })
  },

  deleteTuition: (req, res) => {
    Tuition.findByPk(req.params.id).then(tuition => {
      Promise.all([
        FeeList.destroy({ 
          where: { TuitionId: tuition.dataValues.id }
        }),
        tuition.destroy()
      ]).then(() => {
        req.flash('success_messages', '成功刪除費用表')
        return res.redirect('back')
      })
    })
  },
}

module.exports = tuitionController