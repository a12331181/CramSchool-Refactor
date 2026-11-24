// 呈現課堂點名名單，處理出缺席登記及更正紀錄。

const ATTEND_STATUS = require('../constants/attendStatus')
const ATTEND_STATUS_LABELS = require('../constants/attendStatusLabels')
const COURSE_SESSION_STATUS = require('../constants/courseSessionStatus')
const COURSE_SESSION_STATUS_LABELS = require('../constants/courseSessionStatusLabels')
const responses = require('../constants/messages/attendance')
const { DIRECTORY_PAGE_SIZE, ATTENDANCE_SESSION_PAGE_SIZE } = require('../constants/pagination')

const attendanceService = require('../services/attendanceService')
const { getMakeupRoster } = require('../services/makeupService')

const { formatTaipeiDateTime } = require('../utils/date')
const { sendPageError } = require('../utils/pageError')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')
const { formatReferenceLabel } = require('../utils/referenceLabel')

const attendanceController = {
  getAttendanceHomePage: async (req, res) => {
    const pageSize = DIRECTORY_PAGE_SIZE
    const listPage = getPageOffset(req.query.page, pageSize)
    if (!listPage) return sendPageError(res, 400, responses.getAttendanceHomePageInvalidPage)

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
      return sendPageError(res, 400, responses.getCourseAttendanceSessionsPageInvalidCourse)
    }

    const listPage = getPageOffset(req.query.page, ATTENDANCE_SESSION_PAGE_SIZE)
    if (!listPage) {
      return sendPageError(res, 400, responses.getCourseAttendanceSessionsPageInvalidPage)
    }
    const { page } = listPage

    const { month = '', status = '' } = req.query
    const result = await attendanceService.getCourseAttendanceSessions({
      courseId, userId: req.user.id, month, status, page, pageSize: ATTENDANCE_SESSION_PAGE_SIZE
    })
    res.set('Cache-Control', 'no-store')
    if (!result.ok) {
      if (result.code === 'INVALID_MONTH') return sendPageError(res, 400, responses.getCourseAttendanceSessionsPageInvalidMonth)
      if (result.code === 'INVALID_STATUS') return sendPageError(res, 400, responses.getCourseAttendanceSessionsPageInvalidSessionStatus)
      return sendPageError(res, 404, responses.getCourseAttendanceSessionsPageNotFoundCourse)
    }

    const pagination = getPagination({ page, pageSize: ATTENDANCE_SESSION_PAGE_SIZE, totalCount: result.count })
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
      return sendPageError(res, 400, responses.getAttendanceRosterPageInvalidCourseSession)
    }

    const result = await attendanceService.getAttendanceRoster({
      courseId,
      calendarId,
      userId: req.user.id
    })

    if (!result) {
      req.flash('error_messages', responses.getAttendanceRosterPageNotFoundSession)
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
      makeups: await getMakeupRoster(calendarId),
      remainingCount: result.students.filter(s => !s.hasAttend && !s.needsEnrollmentReview).length,
      startAtText: formatTaipeiDateTime(result.calendar.startAt),
      endAtText: formatTaipeiDateTime(result.calendar.endAt),
      calendarStartAt: result.calendar.startAt.toISOString(),
      calendarEndAt: result.calendar.endAt.toISOString(),
      students: result.students.map(student => ({
        ...student,
        attendText: student.hasAttend
          ? ATTEND_STATUS_LABELS[student.attendStatus] ?? '舊紀錄待核對'
          : ATTEND_STATUS_LABELS[ATTEND_STATUS.UNMARKED],
        canCreateAttend: canCreate && !student.hasAttend && !student.needsEnrollmentReview,
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
      return sendPageError(res, 400, responses.recordAttendanceInvalidStudentCourseSession)
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

    const errors = responses.recordAttendanceErrors

    const message = result.ok
        ? (result.created ? responses.recordAttendanceSavedAttendance : responses.recordAttendanceUnchangedRecordAttendance)
        : errors[result.code] ?? responses.recordAttendanceUnavailable
    if (req.get('Accept') === 'application/json') {
      return res.status(result.ok ? 200 : 409).json({ ok: result.ok, message })
    }
    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(
      303,
      `/cramschool/attend/courses/${courseId}/calendar/${calendarId}/students#roster-${studentId}`
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
      return sendPageError(res, 400, responses.updateAttendanceInvalidStudentCourseSession)
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

    const errors = responses.updateAttendanceErrors

    const message = result.ok
        ? (result.changed ? responses.updateAttendanceSavedRecordAttendance : responses.updateAttendanceUnchanged)
        : errors[result.code] ?? responses.updateAttendanceUnavailable
    if (req.get('Accept') === 'application/json') {
      return res.status(result.ok ? 200 : 409).json({ ok: result.ok, message })
    }
    req.flash(result.ok ? 'success_messages' : 'error_messages', message)
    return res.redirect(
      303,
      `/cramschool/attend/courses/${courseId}/calendar/${calendarId}/students#roster-${studentId}`
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
      return sendPageError(res, 400, responses.getAttendanceHistoryPageInvalidStudentCourseSession)
    }

    const result = await attendanceService.getAttendanceHistory({
      courseId,
      calendarId,
      studentId,
      userId: req.user.id
    })

    if (!result) {
      req.flash('error_messages', responses.getAttendanceHistoryPageNotFoundRecordAttendance)
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
