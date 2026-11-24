// 提供教師名單與在職資訊。

const responses = require('../constants/messages/teacher')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')

const teacherService = require('../services/teacherService')

const { sendPageError } = require('../utils/pageError')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')

const teacherController = {
  getTeacherDirectoryPage: async (req, res) => {
    const pageSize = DIRECTORY_PAGE_SIZE
    const listPage = getPageOffset(req.query.page, pageSize)
    if (!listPage) return sendPageError(res, 400, responses.getTeacherDirectoryPageInvalidPage)

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
