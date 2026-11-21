const courseService = require('../services/courseService')
const calendarService = require('../services/calendarService')
const COURSE_SESSION_STATUS_LABELS = require('../constants/courseSessionStatusLabels')
const { formatTaipeiDateTime } = require('../utils/date')

const courseController = {
  getCourseListPage: async (req, res) => {
    const courses = await courseService.getCourseDirectory(req.user.id)
    return res.render('courses/index', { courses, isAdmin: req.user.isAdmin })
  },

  getCourseCalendarPage: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
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
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await courseService.getCourseEnrolledStudents(courseId)
    if (!result) return res.redirect('/cramschool/courses')

    return res.render('courses/students', result)
  }
}

module.exports = courseController
