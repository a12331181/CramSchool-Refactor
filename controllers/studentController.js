// 顯示學生基本資料、修課與歷次出缺席。

const ATTEND_STATUS_LABELS = require('../constants/attendStatusLabels')
const responses = require('../constants/messages/student')

const studentService = require('../services/studentService')

const { formatTaipeiDateTime } = require('../utils/date')
const { sendPageError } = require('../utils/pageError')
const { studentDirectoryQuery } = require('../utils/studentDirectory')

const studentController = {
  getStudentDetailsPage: async (req, res) => {
    const result = await studentService.getStudentDetails(req.params.studentId)

    if (!result) {
     return res.redirect('/cramschool/students')
    }

    return res.render('students/detail', { ...result, directoryQuery: studentDirectoryQuery(req.query) })
  },

  getStudentAttendanceHistoryPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)
    if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
      return sendPageError(res, 400, responses.getStudentAttendanceHistoryPageInvalidStudentCourse)
    }

    const result = await studentService.getStudentAttendanceHistory({ courseId, studentId })
    if (!result) return res.redirect('/cramschool/students')

    return res.render('students/attendance', {
      student: result.student,
      course: result.course,
      attends: result.attends.map(({ calendarId, startAt, content, status, reason, isCancelled }) => ({
        calendarId,
        startAtText: formatTaipeiDateTime(startAt),
        content,
        statusText: Object.hasOwn(ATTEND_STATUS_LABELS, status) ? ATTEND_STATUS_LABELS[status] : '待核對',
        reason,
        isCancelled
      }))
    })
  }
}

module.exports = studentController
