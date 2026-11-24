const { sendPageError } = require('../utils/pageError')
const meetingService = require('../services/meetingService')
const { getPagination, getPaginationLinks, getPageOffset } = require('../utils/pagination')
const { SCHOOL_RECORDS_PAGE_SIZE } = require('../constants/pagination')

const meetingController = {
  getMeetingListPage: async (req, res) => {
    const listPage = getPageOffset(req.query.page, SCHOOL_RECORDS_PAGE_SIZE)
    if (!listPage) {
      return sendPageError(res, 400, '頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const meetings = await meetingService.getMeetingsPage({ offset, limit: SCHOOL_RECORDS_PAGE_SIZE })

    const pagination = getPagination({ page, pageSize: SCHOOL_RECORDS_PAGE_SIZE, totalCount: meetings.count })
    const pageUrl = targetPage => `/cramschool/meetings?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/meetings/index', {
      meetings: meetings.rows.map((record, index) => ({ ...record, rowNumber: offset + index + 1 })),
      isAdmin: req.user.isAdmin,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getMeetingDetailsPage: async (req, res) => {
    const meeting = await meetingService.getMeetingDetails(req.params.meetingId)
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
    const deleted = await meetingService.deleteMeeting(req.params.meetingId)
    req.flash(
      deleted ? 'success_messages' : 'error_messages',
      deleted ? '已成功刪除會議記錄' : '找不到會議紀錄'
    )
    return res.redirect('/cramschool/meetings')
  }
}

module.exports = meetingController
