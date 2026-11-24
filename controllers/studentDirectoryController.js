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

  if (req.query.q !== undefined && (typeof req.query.q !== 'string' || req.query.q.length > 80)) {
    return sendPageError(res, 400, '請輸入 80 字以內的姓名或學號。')
  }
  const query = req.query.q?.trim() || ''
  const { page, offset } = listPage
  const directoryPath = manageStudents ? '/admin/students' : '/cramschool/students'
  const fetchPage = manageStudents ? studentService.getAdminStudentsPage : studentService.getStudentsPage
  const { rows, count, courses } = await fetchPage({ page, courseId, query, pageSize: DIRECTORY_PAGE_SIZE })
  const pagination = getPagination({ page, pageSize: DIRECTORY_PAGE_SIZE, totalCount: count })
  const pageUrl = targetPage => {
    const params = new URLSearchParams({ page: String(targetPage) })
    if (query) params.set('q', query)
    if (courseId !== undefined) params.set('courseId', String(courseId))
    return `${directoryPath}?${params}`
  }

  if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

  return res.render('students/index', {
    layout: 'workspace',
    workspaceTitle: manageStudents ? '學生管理' : '學生名單',
    activeNav: manageStudents ? 'admin-students' : 'students',
    directoryPath, manageStudents, students: rows.map((student, index) => ({ ...student, rowNumber: offset + index + 1 })),
    query, detailQuery: pageUrl(page).split('?')[1], courses, count,
    courseId: courseId ?? '', activeStatus: STUDENT_STATUS.ACTIVE, leftStatus: STUDENT_STATUS.LEFT,
    ...getPaginationLinks(pagination, pageUrl)
  })
}

module.exports = {
  getStudentListPage: (req, res) => renderDirectory(req, res, false),
  getAdminStudentListPage: (req, res) => renderDirectory(req, res, true)
}
