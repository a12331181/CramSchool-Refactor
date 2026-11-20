const studentService = require('../services/studentService')
const { getPagination, getPaginationLinks } = require('../utils/pagination')
const pageLimit = 12

const studentController = {
  getStudents: async (req, res) => {
    const requestedPage = Number(req.query.page || 1)

    const requestedCourseId = req.query.courseId
      ? Number(req.query.courseId)
      : undefined

    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
      return res.status(400).send('頁碼必須是正整數')
    }

    if (
      requestedCourseId !== undefined &&
      (!Number.isSafeInteger(requestedCourseId) || requestedCourseId < 1)
    ) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const queryOptions = {
      page: requestedPage,
      courseId: requestedCourseId,
      pageSize: pageLimit
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

  getStudent: async (req, res) => {
    const result = await studentService.getStudentDetails(req.params.id)

    if (!result) {
     return res.redirect('/cramschool/students')
    }

    return res.render('students/detail', result)
  },

  getStudentAttendanceHistory: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)
    if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
      return res.status(400).send('課程與學生 ID 必須是正整數')
    }

    const result = await studentService.getStudentAttendanceHistory({ courseId, studentId })
    if (!result) return res.redirect('/cramschool/students')

    return res.render('students/attendance', result)
  }
}

module.exports = studentController