const userService = require('../services/userService')
const extraFeeService = require('../services/extraFeeService')
const pageLimit = 12
const calendarService = require('../services/calendarService')
const { getPagination, getPaginationLinks } = require('../utils/pagination')
const { formatTaipeiDateTime } = require('../utils/date')
const COURSE_SESSION_STATUS = require('../constants/courseSessionStatus')
const COURSE_SESSION_STATUS_LABELS = require('../constants/courseSessionStatusLabels')

const adminController = {
  // 後臺首頁
  getSchoolIndexPage: (req, res) => {
    return res.render('admin/dashboard')
  },

  // 課程行事曆相關程式碼
  getCourseCalendar: async (req, res) => {
    const courseId = Number(req.params.id)
    const page = Number(req.query.page || 1)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger((page - 1) * pageLimit)
    ) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }

    const result = await calendarService.getAdminCourseCalendarPage({
      courseId,
      page,
      pageSize: pageLimit
    })

    if (!result.ok) {
      const errorMessages = {
        COURSE_NOT_FOUND: '找不到課程資料',
        COURSE_CLOSED: '課程已關閉，暫不提供此操作頁面'
      }

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? '無法取得課程行事曆'
      )

      return res.redirect('/admin/courses')
    }

    const pagination = getPagination({
      page,
      pageSize: pageLimit,
      totalCount: result.count
    })

    const pageUrl = targetPage => `/admin/courses/${courseId}/calendar?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    const calendars = result.rows.map(calendar => ({
      ...calendar,
      rowClass: calendar.isLegacy && !calendar.isActive
        ? 'table-secondary'
        : 'table-light',

      canCancel: calendar.status === COURSE_SESSION_STATUS.SCHEDULED,

      canComplete:
        calendar.status === COURSE_SESSION_STATUS.SCHEDULED &&
        calendar.endAt instanceof Date &&
        Number.isFinite(calendar.endAt.getTime()) &&
        calendar.endAt.getTime() <= Date.now(),

      startAtText:
        formatTaipeiDateTime(calendar.startAt) ?? '待核對',

      endAtText:
        formatTaipeiDateTime(calendar.endAt) ?? '待核對',

      statusText: Object.hasOwn(COURSE_SESSION_STATUS_LABELS, calendar.status)
        ? COURSE_SESSION_STATUS_LABELS[calendar.status]
        : '待核對'
    }))
    return res.render('admin/calendars/index', {
      course: result.course,
      calendars,
      page,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getCreateCourseSessionPage: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await calendarService.getCreateCourseSessionFormData(courseId)

    if (!result.ok) {
      const errorMessages = {
        COURSE_NOT_FOUND: '找不到課程資料',
        COURSE_CLOSED: '課程已關閉，無法新增課堂'
      }

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? '無法開啟新增課堂頁面'
      )

      return res.redirect('/admin/courses')
    }

    const teachers = result.teachers.map(teacher => ({
      ...teacher,
      isSelected: teacher.id === result.course.TeacherId
    }))

    return res.render('admin/calendars/create', {
      course: result.course,
      teachers,
      values: {},
      canSubmit: teachers.length > 0
    })
  },

  createCourseSession: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const body = req.body ?? {}

    const teacherId =
      typeof body.teacherId === 'string' && body.teacherId.trim() !== ''
        ? Number(body.teacherId)
        : NaN

    const result = await calendarService.createCourseSession(courseId, {
      startAt: body.startAt,
      endAt: body.endAt,
      teacherId,
      content: body.content
    })

    if (result.ok) {
      const pagination = getPagination({
        page: 1,
        pageSize: pageLimit,
        totalCount: result.data.totalCount
      })

      req.flash('success_messages', `已新增課堂 #${result.data.id}`)

      return res.redirect(
        303,
        `/admin/courses/${courseId}/calendar?page=${pagination.totalPages}`
      )
    }

    const errors = {
      INVALID_COURSE_ID: [400, '課程 ID 必須是正整數'],
      INVALID_START_AT: [400, '開始日期或時間不正確'],
      INVALID_END_AT: [400, '結束日期或時間不正確'],
      INVALID_TIME_RANGE: [400, '結束時間必須晚於開始時間'],
      INVALID_TEACHER_ID: [400, '請選擇有效的授課教師'],
      INVALID_CONTENT: [400, '課堂內容必須是文字，且不可超過 40 個字元'],
      COURSE_NOT_FOUND: [404, '找不到課程資料'],
      COURSE_CLOSED: [409, '課程已關閉，無法新增課堂'],
      TEACHER_UNAVAILABLE: [409, '所選教師目前無法授課，請重新選擇'],
      TIME_CONFLICT: [409, '此課程或授課教師已有重疊課堂，請調整時間'],
      UTC_TIMEZONE_REQUIRED: [500, '系統時間設定異常，暫時無法儲存課堂']
    }

    const [status, errorMessage] =
      errors[result.code] ?? [500, '無法新增課堂']

    if (['COURSE_NOT_FOUND', 'COURSE_CLOSED'].includes(result.code)) {
      req.flash('error_messages', errorMessage)
      return res.redirect(303, '/admin/courses')
    }

    const formData = await calendarService.getCreateCourseSessionFormData(courseId)

    if (!formData.ok) {
      req.flash('error_messages', '課程狀態已變動，請重新確認')
      return res.redirect(303, '/admin/courses')
    }

    const teachers = formData.teachers.map(teacher => ({
      ...teacher,
      isSelected: teacher.id === teacherId
    }))

    return res.status(status).render('admin/calendars/create', {
      course: formData.course,
      teachers,
      values: {
        startAt: typeof body.startAt === 'string' ? body.startAt : '',
        endAt: typeof body.endAt === 'string' ? body.endAt : '',
        content: typeof body.content === 'string' ? body.content : ''
      },
      canSubmit: teachers.length > 0,
      error_messages: [errorMessage]
    })
  },

  completeCourseSession: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)

    if (
      ![courseId, calendarId]
        .every(id => Number.isSafeInteger(id) && id > 0)
    ) {
      return res.status(400).send('課程與課堂 ID 必須是正整數')
    }

    const requestedPage = Number(req.query.page ?? 1)

    const validPage =
      Number.isSafeInteger(requestedPage) &&
      requestedPage > 0 &&
      Number.isSafeInteger((requestedPage - 1) * pageLimit)

    const page = validPage ? requestedPage : 1
    const listUrl = `/admin/courses/${courseId}/calendar?page=${page}`

    const result = await calendarService.completeCourseSession(
      courseId,
      calendarId
    )

    if (!result.ok) {
      const errors = {
        COURSE_NOT_FOUND: '找不到課程資料。',
        COURSE_CLOSED: '課程已關閉，目前無法完成課堂。',
        CALENDAR_NOT_FOUND: '找不到這門課程的課堂。',
        CALENDAR_NOT_COMPLETABLE: '只有已排定的正式課堂可以標記完成。',
        CALENDAR_REQUIRES_REVIEW: '課堂的教師或時間資料需要先核對。',
        CALENDAR_NOT_ENDED: '尚未到這堂課的結束時間。',
        ENROLLMENT_UNCONFIRMED: '學生的選課期間有缺漏或重疊，請先核對。',
        ATTEND_REQUIRES_REVIEW: '點名紀錄與選課資料需要先核對。',
        ATTEND_INCOMPLETE:
          `尚有 ${result.unmarkedCount} 位學生未點名，請先完成點名。`
      }

      req.flash(
        'error_messages',
        errors[result.code] ?? '目前無法完成課堂。'
      )

      const redirectUrl = [
        'COURSE_NOT_FOUND',
        'COURSE_CLOSED'
      ].includes(result.code)
        ? '/admin/courses'
        : listUrl

      return res.redirect(303, redirectUrl)
    }

    req.flash(
      'success_messages',
      result.changed
        ? '已將課堂標記為已完成。'
        : '這堂課原本就已完成。'
    )

    return res.redirect(303, listUrl)
  },

  cancelCourseSession: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)
    const result = await calendarService.cancelCourseSession(courseId, calendarId)

    if (['INVALID_COURSE_ID', 'INVALID_CALENDAR_ID'].includes(result.code)) {
      return res.status(400).send('課程與課堂 ID 必須是正整數')
    }

    const requestedPage = Number(req.query.page ?? 1)
    const validPage =
      Number.isSafeInteger(requestedPage) &&
      requestedPage > 0 &&
      Number.isSafeInteger((requestedPage - 1) * pageLimit)

    const page = validPage ? requestedPage : 1
    const listUrl = `/admin/courses/${courseId}/calendar?page=${page}`

    if (!result.ok) {
      const errors = {
        COURSE_NOT_FOUND: '找不到課程資料',
        COURSE_CLOSED: '課程已關閉，無法取消課堂',
        CALENDAR_NOT_FOUND: '找不到這門課程的課堂',
        CALENDAR_ALREADY_BILLED: `這堂課已列入正式帳單 #${result.billId}，未取消。請先核對相關帳單。`,
        CALENDAR_NOT_CANCELLABLE: '只有已排定的課堂可以取消'
      }

      req.flash('error_messages', errors[result.code] ?? '無法取消課堂')

      if (['COURSE_NOT_FOUND', 'COURSE_CLOSED'].includes(result.code)) {
        return res.redirect(303, '/admin/courses')
      }

      return res.redirect(303, listUrl)
    }

    req.flash(
      'success_messages',
      result.changed ? '已取消課堂' : '這堂課已經取消'
    )

    return res.redirect(303, listUrl)
  },

  getLegacyCalendarEditPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)

    if (
      !Number.isSafeInteger(courseId) || courseId < 1 ||
      !Number.isSafeInteger(calendarId) || calendarId < 1
    ) {
      return res.status(400).send('課程與課堂 ID 必須是正整數')
    }

    const calendar = await calendarService.getLegacyCalendarEditData(
      courseId,
      calendarId
    )

    if (!calendar) {
      return res.status(409).send(
        '此課堂目前無法使用舊日期表單修改，請返回課堂列表確認'
      )
    }

    return res.render('admin/calendars/edit', { calendar })
  },

  updateLegacyCalendar: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)
    const { date, content } = req.body ?? {}

    const result = await calendarService.updateLegacyCalendar(
      courseId,
      calendarId,
      { date, content }
    )

    if (!result.ok) {
      const errors = {
        INVALID_COURSE_ID: [400, '課程 ID 必須是正整數'],
        INVALID_CALENDAR_ID: [400, '課堂 ID 必須是正整數'],
        INVALID_LEGACY_DATE: [400, '日期格式不正確'],
        INVALID_CONTENT: [400, '上課內容必須填寫，且不能超過 40 個字元'],
        COURSE_NOT_FOUND: [404, '找不到課程'],
        COURSE_CLOSED: [409, '課程已關閉，無法修改課堂'],
        LEGACY_CALENDAR_UNAVAILABLE: [
          409,
          '此課堂目前無法使用舊表單修改，請返回列表確認'
        ]
      }

      const [status, message] = errors[result.code] ?? [500, '更新課堂失敗']
      return res.status(status).send(message)
    }

    req.flash('success_messages', '已成功更新課堂資料')
    return res.redirect(303, `/admin/courses/${courseId}/calendar`)
  },

  // 使用者相關程式碼
  getUsers: async (_req, res) => {
    const users = await userService.getAdminUserList()
    return res.render('admin/users/index', { users })
  },

  toggleAdmin: async (req, res) => {
    const userId = Number(req.params.id)
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).send('帳號 ID 必須是正整數')

    const changed = await userService.toggleUserAdmin(userId)
    req.flash(
      changed ? 'success_messages' : 'error_messages',
      changed ? '使用者權限已更新' : '找不到使用者'
    )
    return res.redirect(303, '/admin/users')
  },

  getExtraFees: async (_req, res) => {
    const extrafees = await extraFeeService.getExtraFees()
    return res.render('admin/extra-fees/index', { extrafees })
  },

  getCreateExtraFeePage: (_req, res) => {
    return res.render('admin/extra-fees/form')
  },

  getEditExtraFeePage: async (req, res) => {
    const extrafee = await extraFeeService.getExtraFeeDetails(req.params.id)
    if (!extrafee) return res.redirect('/admin/extrafees')

    return res.render('admin/extra-fees/form', { extrafee })
  },

  createExtraFee: async (req, res) => {
    await extraFeeService.createExtraFee(req.body ?? {})
    req.flash('success_messages', '額外費用已成功建立')
    return res.redirect(303, '/admin/extrafees')
  },

  updateExtraFee: async (req, res) => {
    const updated = await extraFeeService.updateExtraFee(req.params.id, req.body ?? {})
    req.flash(
      updated ? 'success_messages' : 'error_messages',
      updated ? '已成功更新額外費用' : '找不到額外費用'
    )
    return res.redirect(303, '/admin/extrafees')
  },
}

module.exports = adminController