const courseService = require('../services/courseService')
const calendarService = require('../services/calendarService')
const meetingService = require('../services/meetingService')
const diaryService = require('../services/diaryService')
const COURSE_SESSION_STATUS_LABELS = require('../constants/courseSessionStatusLabels')
const { formatTaipeiDateTime } = require('../utils/date')
const { getPagination, getPaginationLinks } = require('../utils/pagination')
const pageLimit = 10

function parseListPage(value) {
  const page = Number(value || 1)
  if (!Number.isSafeInteger(page) || page < 1) return null

  const offset = (page - 1) * pageLimit
  return Number.isSafeInteger(offset) ? { page, offset } : null
}

const schoolController = {
  getSchoolIndexPage: async (req, res) => {
    const [meetings, diaries] = await Promise.all([
      meetingService.getRecentMeetings(5),
      diaryService.getRecentDiaries(4)
    ])
    return res.render('school/home', { isAdmin: req.user.isAdmin, meetings, diaries })
  },
  
  getIntroduction: (req, res) => {
    return res.render('school/introduction')
  },

  getCourses: async (req, res) => {
    const courses = await courseService.getCourseDirectory(req.user.id)
    return res.render('courses/index', { courses, isAdmin: req.user.isAdmin })
  },

  getCourse: async (req, res) => {
    const courseId = Number(req.params.id)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await calendarService.getCourseCalendarData(courseId)

    if (!result) {
      return res.redirect('/cramschool/courses')
    }

    const { course, sessions, currentPeriod, legacyCalendars } = result

    return res.render('courses/calendar', {
      course,
      sessions: sessions.map(session => ({
        startAtText: formatTaipeiDateTime(session.startAt) ?? '待核對',
        endAtText: formatTaipeiDateTime(session.endAt) ?? '待核對',
        statusText: COURSE_SESSION_STATUS_LABELS[session.status] ?? '待核對',
        content: session.content
      })),
      calendars: legacyCalendars,
      currentPeriod,
      firstCalendarDate: legacyCalendars[0]?.date,
      lastCalendarDate: legacyCalendars.at(-1)?.date
    })
  },
  
  getCourseEnrolledStudents: async (req, res) => {
    const courseId = Number(req.params.id)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await courseService.getCourseEnrolledStudents(courseId)
    if (!result) return res.redirect('/cramschool/courses')

    return res.render('courses/students', result)
  },

  getMeetings: async (req, res) => {
    const listPage = parseListPage(req.query.page)
    if (!listPage) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const meetings = await meetingService.getMeetingsPage({ offset, limit: pageLimit })

    const pagination = getPagination({ page, pageSize: pageLimit, totalCount: meetings.count })
    const pageUrl = targetPage => `/cramschool/meetings?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/meetings/index', {
      meetings: meetings.rows,
      isAdmin: req.user.isAdmin,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },
  
  getMeeting: async (req, res) => {
    const meeting = await meetingService.getMeetingDetails(req.params.id)
    if (!meeting) return res.redirect('/cramschool/meetings')

    return res.render('school/meetings/detail', { meeting })
  },

  getCreateMeetingPage: async (req, res) => {
    const teacher = await meetingService.getMeetingAuthor(req.user.id)
    return res.render('school/meetings/create', { teacher })
  },

  createMeeting: async (req, res) => {
    const { date, subject, content } = req.body ?? {}
    const created = await meetingService.createMeeting({ userId: req.user.id, date, subject, content })
    if (!created) {
      req.flash('error_messages', '找不到教師資料，無法建立會議紀錄')
      return res.redirect('/cramschool/meetings')
    }

    req.flash('success_messages', '已成功建立會議紀錄')
    return res.redirect('/cramschool')
  },

  deleteMeeting: async (req, res) => {
    const deleted = await meetingService.deleteMeeting(req.params.id)
    req.flash(
      deleted ? 'success_messages' : 'error_messages',
      deleted ? '已成功刪除會議記錄' : '找不到會議紀錄'
    )
    return res.redirect('/cramschool/meetings')
  },

  getDiariesList: async (req, res) => {
    const listPage = parseListPage(req.query.page)
    if (!listPage) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const diaries = await diaryService.getDiariesPage({ offset, limit: pageLimit })

    const pagination = getPagination({ page, pageSize: pageLimit, totalCount: diaries.count })
    const pageUrl = targetPage => `/cramschool/diaries?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/diaries/index', {
      diaries: diaries.rows,
      isAdmin: req.user.isAdmin,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  deleteDiaryInList: async (req, res) => {
    const deleted = await diaryService.deleteDiary({ diaryId: req.params.id })
    req.flash(
      deleted ? 'success_messages' : 'error_messages',
      deleted ? '已成功刪除教師日誌' : '找不到教師日誌'
    )
    return res.redirect('/cramschool/diaries')
  },

  getDiaries: async (req, res) => {
    const courseId = Number(req.params.id)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const listPage = parseListPage(req.query.page)
    if (!listPage) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const result = await diaryService.getCourseDiariesPage({ courseId, offset, limit: pageLimit })
    if (!result) return res.redirect('/cramschool/courses')
    const { course, diaries } = result

    const pagination = getPagination({ page, pageSize: pageLimit, totalCount: diaries.count })
    const pageUrl = targetPage => `/cramschool/courses/${courseId}/diaries?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/diaries/course-list', {
      diaries: diaries.rows,
      course,
      isDiaryNotExist: diaries.count === 0,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getDiary: async (req, res) => {
    const { courseId, diaryId } = req.params
    const diary = await diaryService.getDiaryDetails({ courseId, diaryId })
    if (!diary) return res.redirect('/cramschool/courses')

    return res.render('school/diaries/detail', { diary })
  },

  getCreateDiaryPage: async (req, res) => {
    const result = await diaryService.getCreateDiaryFormData({ courseId: req.params.id, userId: req.user.id })
    if (!result) return res.redirect('/cramschool/courses')

    return res.render('school/diaries/create', result)
  },

  createDiary: async (req, res) => {
    const courseId = req.params.id
    const { date, subject, content } = req.body ?? {}
    const created = await diaryService.createDiary({ courseId, userId: req.user.id, date, subject, content })
    req.flash(
      created ? 'success_messages' : 'error_messages',
      created ? '已成功建立教師日誌' : '找不到可建立日誌的課程或教師資料'
    )
    return res.redirect(created ? `/cramschool/courses/${courseId}/diaries` : '/cramschool/courses')
  },

  deleteDiary: async (req, res) => {
    const { courseId, diaryId } = req.params
    const deleted = await diaryService.deleteDiary({ courseId, diaryId })
    req.flash(
      deleted ? 'success_messages' : 'error_messages',
      deleted ? '已成功刪除教師日誌' : '在這門課程找不到該筆日誌'
    )
    return res.redirect(`/cramschool/courses/${courseId}/diaries`)
  },
}
module.exports = schoolController