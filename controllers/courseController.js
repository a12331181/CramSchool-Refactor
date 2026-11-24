// 提供課程目錄、課堂行事曆與學生名單頁面。

const COURSE_SESSION_STATUS_LABELS = require('../constants/courseSessionStatusLabels')
const responses = require('../constants/messages/course')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')

const calendarService = require('../services/calendarService')
const courseService = require('../services/courseService')

const { formatTaipeiDateTime } = require('../utils/date')
const { sendPageError } = require('../utils/pageError')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')

const courseController = {
  getCourseListPage: async (req, res) => {
    const pageSize = DIRECTORY_PAGE_SIZE
    const listPage = getPageOffset(req.query.page, pageSize)
    if (!listPage) return sendPageError(res, 400, responses.getCourseListPageInvalidPage)

    const { page, offset } = listPage
    const { courses, count } = await courseService.getCourseDirectoryPage({
      userId: req.user.id, limit: pageSize, offset
    })
    const pagination = getPagination({ page, pageSize, totalCount: count })
    const pageUrl = targetPage => `/cramschool/courses?page=${targetPage}`
    if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

    return res.render('courses/index', {
      courses,
      isAdmin: req.user.isAdmin,
      totalCount: count,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getCourseCalendarPage: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.getCourseCalendarPageInvalidCourse)
    }

    const result = await calendarService.getCourseCalendarData(courseId)

    if (!result) {
      return res.redirect('/cramschool/courses')
    }

    const { course, sessions } = result

    return res.render('courses/calendar', {
      course,
      sessions: sessions.map(session => ({
        startAtText: formatTaipeiDateTime(session.startAt) ?? '待核對',
        endAtText: formatTaipeiDateTime(session.endAt) ?? '待核對',
        statusText: COURSE_SESSION_STATUS_LABELS[session.status] ?? '待核對',
        content: session.content
      }))
    })
  },

  getCourseStudentsPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.getCourseStudentsPageInvalidCourse)
    }

    const result = await courseService.getCourseEnrolledStudents(courseId)
    if (!result) return res.redirect('/cramschool/courses')

    return res.render('courses/students', result)
  }
}

module.exports = courseController
