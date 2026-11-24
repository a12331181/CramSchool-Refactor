const { sendPageError } = require('../utils/pageError')
const studentService = require('../services/studentService')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')
const STUDENT_STATUS = require('../constants/studentStatus')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')

async function renderDirectory(req, res, manageStudents) {
  const listPage = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)
  if (!listPage) return sendPageError(res, 400, '頁碼必須是正整數')

  const courseId = req.query.courseId ? Number(req.query.courseId) : undefined
  if (courseId !== undefined && (!Number.isSafeInteger(courseId) || courseId < 1)) {
    return sendPageError(res, 400, '課程 ID 必須是正整數')
  }

  const { page } = listPage
  const directoryPath = manageStudents ? '/admin/students' : '/cramschool/students'
  const fetchPage = manageStudents ? studentService.getAdminStudentsPage : studentService.getStudentsPage
  const { rows, count, courses } = await fetchPage({ page, courseId, pageSize: DIRECTORY_PAGE_SIZE })
  const pagination = getPagination({ page, pageSize: DIRECTORY_PAGE_SIZE, totalCount: count })
  const pageUrl = targetPage => {
    const query = new URLSearchParams({ page: String(targetPage) })
    if (courseId !== undefined) query.set('courseId', String(courseId))
    return `${directoryPath}?${query}`
  }

  if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

  return res.render('students/index', {
    layout: 'workspace',
    workspaceTitle: manageStudents ? '學生管理' : '學生名單',
    activeNav: manageStudents ? 'admin-students' : 'students',
    directoryPath, manageStudents, students: rows, courses, count,
    courseId: courseId ?? '', activeStatus: STUDENT_STATUS.ACTIVE, leftStatus: STUDENT_STATUS.LEFT,
    ...getPaginationLinks(pagination, pageUrl)
  })
}

module.exports = {
  getStudentListPage: (req, res) => renderDirectory(req, res, false),
  getAdminStudentListPage: (req, res) => renderDirectory(req, res, true)
}
