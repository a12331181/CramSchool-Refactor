const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')
const studentService = require('../services/studentService')
const ATTEND_STATUS_LABELS = require('../constants/attendStatusLabels')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')
const { formatTaipeiDateTime } = require('../utils/date')

const studentController = {
  getStudentListPage: async (req, res) => {
    const listPage = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)
    if (!listPage) return res.status(400).send('頁碼必須是正整數')
    const { page: requestedPage } = listPage

    const requestedCourseId = req.query.courseId
      ? Number(req.query.courseId)
      : undefined

    if (
      requestedCourseId !== undefined &&
      (!Number.isSafeInteger(requestedCourseId) || requestedCourseId < 1)
    ) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const queryOptions = {
      page: requestedPage,
      courseId: requestedCourseId,
      pageSize: DIRECTORY_PAGE_SIZE
    }

    const result = await studentService.getStudentsPage(queryOptions)

    const pagination = getPagination({
      page: queryOptions.page,
      pageSize: queryOptions.pageSize,
      totalCount: result.count
    })
    
    const pageUrl = targetPage => {
      const queryParams = new URLSearchParams({ page: String(targetPage) })
      if (queryOptions.courseId !== undefined) {
        queryParams.set('courseId', String(queryOptions.courseId))
      }
      return `/cramschool/students?${queryParams.toString()}`
    }

    if (queryOptions.page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('students/index', {
      students: result.rows,
      courses: result.courses,
      courseId: queryOptions.courseId ?? '',
      ...getPaginationLinks(pagination, pageUrl),
      isAdmin: req.user.isAdmin
    })
  },

  getStudentDetailsPage: async (req, res) => {
    const result = await studentService.getStudentDetails(req.params.studentId)

    if (!result) {
     return res.redirect('/cramschool/students')
    }

    return res.render('students/detail', result)
  },

  getStudentAttendanceHistoryPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)
    if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
      return res.status(400).send('課程與學生 ID 必須是正整數')
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
