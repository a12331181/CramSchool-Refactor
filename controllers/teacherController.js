const teacherService = require('../services/teacherService')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')

const teacherController = {
  getTeacherDirectoryPage: async (req, res) => {
    const pageSize = DIRECTORY_PAGE_SIZE
    const listPage = getPageOffset(req.query.page, pageSize)
    if (!listPage) return res.status(400).send('頁碼必須是有效的正整數。')

    const { page, offset } = listPage
    const { teachers, count } = await teacherService.getActiveTeachersPage({ limit: pageSize, offset })
    const pagination = getPagination({ page, pageSize, totalCount: count })
    const pageUrl = targetPage => `/cramschool/teachers?page=${targetPage}`
    if (page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))

    return res.render('teachers/index', {
      teachers,
      isAdmin: req.user.isAdmin,
      totalCount: count,
      ...getPaginationLinks(pagination, pageUrl)
    })
  }
}

module.exports = teacherController
