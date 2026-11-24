const responses = require('../constants/messages/adminCalendar')
const { sendPageError } = require('../utils/pageError')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')
const calendarService = require('../services/calendarService')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')
const { formatTaipeiDateTime, getTaipeiDate, parseTaipeiDateTime } = require('../utils/date')
const COURSE_SESSION_STATUS = require('../constants/courseSessionStatus')
const COURSE_SESSION_STATUS_LABELS = require('../constants/courseSessionStatusLabels')

const COURSE_SESSION_BATCH_LIMIT = require('../constants/courseSessionBatchLimit')
const { createSessionFormToken, isValidSessionFormToken } = require('../utils/sessionFormToken')

const BATCH_ERRORS = responses.batchErrors

function renderBatchForm(req, res, form, { status = 200, error, body = {}, conflictDates = [] } = {}) {
  const readText = key => typeof body[key] === 'string' ? body[key] : ''
  const selectedDates = Array.isArray(body.dates)
    ? [...new Set(body.dates.filter(date => typeof date === 'string' &&
      parseTaipeiDateTime(`${date}T00:00`)))].sort().slice(0, COURSE_SESSION_BATCH_LIMIT)
    : []
  const selectedTeacher = body.teacherId === undefined ? form.course.TeacherId : Number(readText('teacherId'))

  req.session.courseSessionBatchToken ??= createSessionFormToken()
  res.set('Cache-Control', 'no-store')
  return res.status(status).render('admin/calendars/create-batch', {
    course: form.course, rooms: form.rooms, selectedRoom: roomId(body),
    teachers: form.teachers.map(teacher => ({ ...teacher, isSelected: teacher.id === selectedTeacher })),
    canSubmit: form.teachers.length > 0,
    batchToken: req.session.courseSessionBatchToken,
    maxDates: COURSE_SESSION_BATCH_LIMIT,
    selectedDates,
    conflictDates,
    calendarMonth: (conflictDates[0] ?? selectedDates[0] ?? getTaipeiDate()).slice(0, 7),
    values: { startTime: readText('startTime'), endTime: readText('endTime'), content: readText('content') },
    error
  })
}

function redirectFromUnavailableCourse(req, res, code) {
  req.flash('error_messages', code === 'COURSE_CLOSED' ? responses.redirectFromUnavailableCourse_unavailableCourseSession : responses.redirectFromUnavailableCourse_notFoundCourseProfile)
  return res.redirect(303, '/admin/courses')
}

function roomId(body) {
  return body.classroomId === undefined || body.classroomId === '' ? null : Number(body.classroomId)
}

function showWarnings(req, res, result) {
  const allowed = ['dates','startTime','endTime','startAt','endAt','teacherId','classroomId','content','batchToken','version']
  const fields = allowed.flatMap(name => [req.body[name]].flat().filter(value => typeof value === 'string').map(value => ({ name, value })))
  return res.status(409).render('school/schedule/conflicts', { workspaceTitle: '學生撞堂提醒',
    fields, ...result, action: req.originalUrl, back: '/admin/courses/' + req.params.courseId + '/calendar' })
}

const adminCalendarController = {
  showWarnings,
  getCreateCourseSessionBatchPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    if (!Number.isSafeInteger(courseId) || courseId < 1) return sendPageError(res, 400, responses.getCreateCourseSessionBatchPageInvalidCourse)

    const form = await calendarService.getCreateCourseSessionFormData(courseId)
    if (!form.ok) return redirectFromUnavailableCourse(req, res, form.code)
    return renderBatchForm(req, res, form)
  },

  createCourseSessionBatch: async (req, res) => {
    const courseId = Number(req.params.courseId)
    if (!Number.isSafeInteger(courseId) || courseId < 1) return sendPageError(res, 400, responses.createCourseSessionBatchInvalidCourse)

    const body = req.body ?? {}
    if (!isValidSessionFormToken(body.batchToken, req.session?.courseSessionBatchToken)) {
      return sendPageError(res, 403, responses.createCourseSessionBatchInvalid)
    }

    const result = await calendarService.createCourseSessionBatch(courseId, {
      dates: body.dates,
      startTime: body.startTime,
      endTime: body.endTime,
      teacherId: typeof body.teacherId === 'string' ? Number(body.teacherId) : NaN,
      classroomId: roomId(body), conflictKey: body.conflictKey,
      content: body.content
    })
    if (result.code === 'STUDENT_CONFLICT') return showWarnings(req, res, result)
    if (result.code === 'INVALID_ROOM') return sendPageError(res, 400, responses.createCourseSessionBatchInvalidRoom)
    if (result.ok) {
      const { createdCount, totalCount } = result.data
      const { totalPages } = getPagination({ page: 1, pageSize: DIRECTORY_PAGE_SIZE, totalCount })
      req.flash('success_messages', responses.createCourseSessionBatchMessage(createdCount))
      return res.redirect(303, `/admin/courses/${courseId}/calendar?page=${totalPages}`)
    }
    if (['COURSE_NOT_FOUND', 'COURSE_CLOSED'].includes(result.code)) {
      return redirectFromUnavailableCourse(req, res, result.code)
    }

    const form = await calendarService.getCreateCourseSessionFormData(courseId)
    if (!form.ok) return redirectFromUnavailableCourse(req, res, form.code)
    const [status, error] = BATCH_ERRORS[result.code] ?? [500, responses.batchSaveFailed]
    return renderBatchForm(req, res, form, { status, error, body, conflictDates: result.conflictDates })
  },

  getCourseCalendarPage: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.getCourseCalendarPageInvalidCourse)
    }

    const listPage = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)
    if (!listPage) {
      return sendPageError(res, 400, responses.getCourseCalendarPageInvalidPage)
    }
    const { page } = listPage

    const result = await calendarService.getAdminCourseCalendarPage({
      courseId,
      page,
      pageSize: DIRECTORY_PAGE_SIZE
    })

    if (!result.ok) {
      const errorMessages = responses.getCourseCalendarPageErrors

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? responses.getCourseCalendarPageUnavailableCourse
      )

      return res.redirect('/admin/courses')
    }

    const pagination = getPagination({
      page,
      pageSize: DIRECTORY_PAGE_SIZE,
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
      return sendPageError(res, 400, responses.getCreateCourseSessionPageInvalidCourse)
    }

    const result = await calendarService.getCreateCourseSessionFormData(courseId)

    if (!result.ok) {
      const errorMessages = responses.getCreateCourseSessionPageErrors

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? responses.getCreateCourseSessionPageUnavailableSession
      )

      return res.redirect('/admin/courses')
    }

    const teachers = result.teachers.map(teacher => ({
      ...teacher,
      isSelected: teacher.id === result.course.TeacherId
    }))

    return res.render('admin/calendars/create', {
      course: result.course, rooms: result.rooms,
      teachers,
      values: {},
      canSubmit: teachers.length > 0
    })
  },

  createCourseSession: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.createCourseSessionInvalidCourse)
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
      classroomId: roomId(body), conflictKey: body.conflictKey,
      content: body.content
    })
    if (result.code === 'STUDENT_CONFLICT') return showWarnings(req, res, result)
    if (result.code === 'INVALID_ROOM') return sendPageError(res, 400, responses.createCourseSessionInvalidRoom)

    if (result.ok) {
      const pagination = getPagination({
        page: 1,
        pageSize: DIRECTORY_PAGE_SIZE,
        totalCount: result.data.totalCount
      })

      req.flash('success_messages', responses.createCourseSessionMessageSession(result.data.id))

      return res.redirect(
        303,
        `/admin/courses/${courseId}/calendar?page=${pagination.totalPages}`
      )
    }

    const errors = responses.createCourseSessionErrors

    const [status, errorMessage] =
      errors[result.code] ?? [500, responses.sessionSaveFailed]

    if (['COURSE_NOT_FOUND', 'COURSE_CLOSED'].includes(result.code)) {
      req.flash('error_messages', errorMessage)
      return res.redirect(303, '/admin/courses')
    }

    const formData = await calendarService.getCreateCourseSessionFormData(courseId)

    if (!formData.ok) {
      req.flash('error_messages', responses.createCourseSessionInvalidCourseStatus)
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
    const calendarId = Number(req.params.sessionId)

    if (
      ![courseId, calendarId]
        .every(id => Number.isSafeInteger(id) && id > 0)
    ) {
      return sendPageError(res, 400, responses.completeCourseSessionInvalidCourseSession)
    }

    const page = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)?.page ?? 1
    const listUrl = `/admin/courses/${courseId}/calendar?page=${page}`

    const result = await calendarService.completeCourseSession(
      courseId,
      calendarId
    )

    if (!result.ok) {
      const errors = responses.completeCourseSessionErrors(result)

      req.flash(
        'error_messages',
        errors[result.code] ?? responses.completeCourseSessionUnavailableSession
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
        ? responses.completeCourseSessionMessageSession
        : responses.completeCourseSessionMessage
    )

    return res.redirect(303, listUrl)
  },

  cancelCourseSession: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.sessionId)
    const result = await calendarService.cancelCourseSession(courseId, calendarId)

    if (['INVALID_COURSE_ID', 'INVALID_CALENDAR_ID'].includes(result.code)) {
      return sendPageError(res, 400, responses.cancelCourseSessionInvalidCourseSession)
    }

    const page = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)?.page ?? 1
    const listUrl = `/admin/courses/${courseId}/calendar?page=${page}`

    if (!result.ok) {
      const errors = responses.cancelCourseSessionErrors(result)

      req.flash('error_messages', errors[result.code] ?? responses.cancelCourseSessionUnavailableSession)

      if (['COURSE_NOT_FOUND', 'COURSE_CLOSED'].includes(result.code)) {
        return res.redirect(303, '/admin/courses')
      }

      return res.redirect(303, listUrl)
    }

    req.flash(
      'success_messages',
      result.changed ? responses.cancelCourseSessionMessageSession : responses.cancelCourseSessionUnchanged
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
      return sendPageError(res, 400, responses.getLegacyCalendarEditPageInvalidCourseSession)
    }

    const calendar = await calendarService.getLegacyCalendarEditData(
      courseId,
      calendarId
    )

    if (!calendar) {
      return sendPageError(res, 409,
        responses.getLegacyCalendarEditPageUnavailableDateSession)
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
      const errors = responses.updateLegacyCalendarErrors

      const [status, message] = errors[result.code] ?? [500, responses.sessionUpdateFailed]
      return sendPageError(res, status, message)
    }

    req.flash('success_messages', responses.updateLegacyCalendarSavedSessionProfile)
    return res.redirect(303, `/admin/courses/${courseId}/calendar`)
  },
}

module.exports = adminCalendarController
