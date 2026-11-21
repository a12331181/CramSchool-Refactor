const { formatReferenceLabel } = require('../utils/referenceLabel')
const attendanceService = require('../services/attendanceService')
const COURSE_SESSION_STATUS = require('../constants/courseSessionStatus')
const COURSE_SESSION_STATUS_LABELS = require('../constants/courseSessionStatusLabels')
const ATTEND_STATUS = require('../constants/attendStatus')
const ATTEND_STATUS_LABELS = require('../constants/attendStatusLabels')
const STAFF_DIRECTORY_PAGE_SIZE = require('../constants/staffDirectoryPageSize')
const { formatTaipeiDateTime } = require('../utils/date')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')

const SESSION_PAGE_SIZE = 20

const attendanceController = {
  getAttendanceHomePage: async (req, res) => {
    const pageSize = STAFF_DIRECTORY_PAGE_SIZE
    const listPage = getPageOffset(req.query.page, pageSize)
    if (!listPage) return res.status(400).send('頁碼必須是有效的正整數。')

    const { page, offset } = listPage
    const { courses, count, isAdmin } = await attendanceService.getAttendanceHome({
      userId: req.user.id, limit: pageSize, offset
    })
    res.set('Cache-Control', 'no-store')

    const pagination = getPagination({ page, pageSize, totalCount: count })
    const pageUrl = targetPage => `/cramschool/attend?page=${targetPage}`
    if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

    return res.render('attendance/index', {
      courses,
      isAdmin,
      totalCount: count,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getCourseAttendanceSessionsPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數。')
    }

    const pageText = req.query.page ?? '1'
    const page = Number(pageText)
    if (
      typeof pageText !== 'string' || !/^[1-9][0-9]*$/.test(pageText) ||
      !Number.isSafeInteger(page) || !Number.isSafeInteger((page - 1) * SESSION_PAGE_SIZE)
    ) {
      return res.status(400).send('頁碼必須是有效的正整數。')
    }

    const { month = '', status = '' } = req.query
    const result = await attendanceService.getCourseAttendanceSessions({
      courseId, userId: req.user.id, month, status, page, pageSize: SESSION_PAGE_SIZE
    })
    res.set('Cache-Control', 'no-store')
    if (!result.ok) {
      if (result.code === 'INVALID_MONTH') return res.status(400).send('月份格式必須為 YYYY-MM。')
      if (result.code === 'INVALID_STATUS') return res.status(400).send('請選擇有效的課堂狀態。')
      return res.status(404).send('找不到可查看的課程。')
    }

    const pagination = getPagination({ page, pageSize: SESSION_PAGE_SIZE, totalCount: result.count })
    const listUrl = `/cramschool/attend/courses/${courseId}/sessions`
    const pageUrl = targetPage => {
      const query = new URLSearchParams()
      if (month) query.set('month', month)
      if (status) query.set('status', status)
      query.set('page', String(targetPage))
      return `${listUrl}?${query}`
    }
    if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

    const sessions = result.rows.map(session => ({
      id: session.id,
      teacherName: formatReferenceLabel(session.Teacher?.User?.userNo, session.Teacher?.name ?? '待核對'),
      startAtText: formatTaipeiDateTime(session.startAt) ?? '待核對',
      endAtText: formatTaipeiDateTime(session.endAt) ?? '待核對',
      statusText: COURSE_SESSION_STATUS_LABELS[session.status] ?? '待核對',
      content: session.content,
      canViewStudents: [COURSE_SESSION_STATUS.SCHEDULED, COURSE_SESSION_STATUS.COMPLETED].includes(session.status)
    }))
    const statusOptions = Object.entries(COURSE_SESSION_STATUS_LABELS).map(([value, label]) => ({
      value, label, selected: value === status
    }))
    return res.render('attendance/course-sessions', {
      course: result.course, isAdmin: result.isAdmin, listUrl, sessions, statusOptions, month, totalCount: result.count,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getAttendanceRosterPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)

    if (
      !Number.isSafeInteger(courseId) || courseId < 1 ||
      !Number.isSafeInteger(calendarId) || calendarId < 1
    ) {
      return res.status(400).send('課程與課堂 ID 必須是正整數')
    }

    const result = await attendanceService.getAttendanceRoster({
      courseId,
      calendarId,
      userId: req.user.id
    })

    if (!result) {
      req.flash('error_messages', '找不到可查看的課堂')
      return res.redirect('/cramschool/attend')
    }

    const canCreate =
      result.isAssignedTeacher &&
      result.calendar.status === COURSE_SESSION_STATUS.SCHEDULED &&
      Number(result.course.isActive) === 1

    const canUpdate = result.isAdmin
      ? [
          COURSE_SESSION_STATUS.SCHEDULED,
          COURSE_SESSION_STATUS.COMPLETED
        ].includes(result.calendar.status)
      : canCreate

    return res.render('attendance/roster', {
      ...result,
      startAtText: formatTaipeiDateTime(result.calendar.startAt),
      endAtText: formatTaipeiDateTime(result.calendar.endAt),
      calendarStartAt: result.calendar.startAt.toISOString(),
      calendarEndAt: result.calendar.endAt.toISOString(),
      students: result.students.map(student => ({
        ...student,
        attendText: student.hasAttend
          ? ATTEND_STATUS_LABELS[student.attendStatus] ?? '舊紀錄待核對'
          : ATTEND_STATUS_LABELS[ATTEND_STATUS.UNMARKED],
        canCreateAttend: canCreate && !student.hasAttend,
        canUpdateAttend:
          canUpdate && student.hasAttend &&
          [ATTEND_STATUS.PRESENT, ATTEND_STATUS.ABSENT, ATTEND_STATUS.EXCUSED]
            .includes(student.attendStatus) &&
          Number.isSafeInteger(student.attendVersion) &&
          student.attendVersion >= 0,
        isPresent: student.attendStatus === ATTEND_STATUS.PRESENT,
        isAbsent: student.attendStatus === ATTEND_STATUS.ABSENT,
        isExcused: student.attendStatus === ATTEND_STATUS.EXCUSED,
      }))
    })
  },

  recordAttendance: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)
    const studentId = Number(req.params.studentId)
    const { calendarStartAt, calendarEndAt, status, reason } = req.body ?? {}

    if (
      ![courseId, calendarId, studentId].every(id => Number.isSafeInteger(id) && id > 0) ||
      typeof calendarStartAt !== 'string' || typeof calendarEndAt !== 'string'
    ) {
      return res.status(400).send('課程、課堂、學生或時間格式不正確')
    }

    const result = await attendanceService.recordAttendance({
      courseId,
      calendarId,
      studentId,
      calendarStartAt,
      calendarEndAt,
      status,
      reason,
      userId: req.user.id
    })

    const errors = {
      INVALID_INPUT: '資料格式不正確。',
      CALENDAR_UNAVAILABLE: '找不到可登記的課堂。',
      CALENDAR_CHANGED: '上課時間已變更，請核對後再登記。',
      ENROLLMENT_UNCONFIRMED: '學生當天的選課期間無法確認，請先核對。',
      INVALID_STATUS: '請選擇出席、缺席或請假。',
      INVALID_REASON: '原因／備註必須是 255 字以內的文字。',
      REASON_REQUIRED: '請填寫請假原因。'
    }

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok
        ? (result.created ? '已登記出席。' : '已有點名紀錄，本次未修改。')
        : errors[result.code] ?? '目前無法登記。'
    )

    return res.redirect(
      303,
      `/cramschool/attend/courses/${courseId}/calendar/${calendarId}/students`
    )
  },

  updateAttendance: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)
    const studentId = Number(req.params.studentId)
    const body = req.body ?? {}
    const attendId = Number(body.attendId)
    const attendVersion = Number(body.attendVersion)

    if (
      ![courseId, calendarId, studentId, attendId]
        .every(id => Number.isSafeInteger(id) && id > 0) ||
      body.attendVersion == null ||
      body.attendVersion === '' ||
      !Number.isSafeInteger(attendVersion) ||
      attendVersion < 0 ||
      typeof body.calendarStartAt !== 'string' ||
      typeof body.calendarEndAt !== 'string'
    ) {
      return res.status(400).send('課程、課堂、學生或點名版本格式不正確')
    }

    const result = await attendanceService.updateAttendance({
      courseId,
      calendarId,
      studentId,
      attendId,
      attendVersion,
      userId: req.user.id,
      calendarStartAt: body.calendarStartAt,
      calendarEndAt: body.calendarEndAt,
      status: body.status,
      reason: body.reason,
      correctionReason: body.correctionReason
    })

    const errors = {
      INVALID_INPUT: '資料格式不正確。',
      INVALID_STATUS: '請選擇出席、缺席或請假。',
      INVALID_REASON: '原因／備註必須是 255 字以內的文字。',
      REASON_REQUIRED: '請填寫請假原因。',
      CORRECTION_REASON_REQUIRED: '請填寫 255 字以內的更正原因。',
      CALENDAR_UNAVAILABLE: '這堂課目前無法更正，請回首頁確認。',
      CALENDAR_CHANGED: '上課時間已變更，請重新核對。',
      ATTEND_NOT_FOUND: '找不到這筆點名紀錄。',
      ATTEND_REQUIRES_REVIEW: '這筆舊紀錄需要先核對。',
      VERSION_CONFLICT: '其他分頁已修改這筆點名，請核對重新載入的結果。',
      ENROLLMENT_UNCONFIRMED: '選課期間無法確認，請先核對。'
    }

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok
        ? (result.changed ? '已更正點名並保存操作紀錄。' : '內容相同，沒有變更。')
        : errors[result.code] ?? '目前無法更正。'
    )

    return res.redirect(
      303,
      `/cramschool/attend/courses/${courseId}/calendar/${calendarId}/students`
    )
  },

  getAttendanceHistoryPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)
    const studentId = Number(req.params.studentId)

    if (
      ![courseId, calendarId, studentId]
        .every(id => Number.isSafeInteger(id) && id > 0)
    ) {
      return res.status(400).send('課程、課堂與學生 ID 必須是正整數')
    }

    const result = await attendanceService.getAttendanceHistory({
      courseId,
      calendarId,
      studentId,
      userId: req.user.id
    })

    if (!result) {
      req.flash('error_messages', '找不到可查看的點名紀錄')
      return res.redirect('/cramschool/attend')
    }

    const actorNames = new Map(
      result.actors.map(actor => {
        const accountName = actor.name?.trim() || '未設定名稱'

        const displayName = actor.userNo
          ? `${actor.userNo}｜${accountName}`
          : `未編號｜${accountName}（帳號 #${actor.id}）`

        return [actor.id, displayName]
      })
    )

    return res.render('attendance/history', {
      course: result.course,
      student: result.student,
      startAtText: formatTaipeiDateTime(result.calendar.startAt) ?? '待核對',
      endAtText: formatTaipeiDateTime(result.calendar.endAt) ?? '待核對',
      currentStatusText: ATTEND_STATUS_LABELS[result.attend.status] ?? '待核對',
      logs: result.logs.map(log => ({
        id: log.id,
        occurredAtText: formatTaipeiDateTime(log.occurredAt) ?? '待核對',
        actorName: actorNames.get(log.actorId) || `帳號 #${log.actorId}`,
        beforeStatusText: ATTEND_STATUS_LABELS[log.before?.status] ?? '待核對',
        afterStatusText: ATTEND_STATUS_LABELS[log.after?.status] ?? '待核對',
        beforeReason: log.before?.reason,
        afterReason: log.after?.reason,
        correctionReason: log.reason
      }))
    })
  },
}

module.exports = attendanceController
