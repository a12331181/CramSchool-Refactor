const diaryService = require('../services/diaryService')
const { getPagination, getPaginationLinks, getPageOffset } = require('../utils/pagination')
const SCHOOL_RECORDS_PAGE_SIZE = require('../constants/schoolRecordsPageSize')

const diaryController = {
  getDiaryListPage: async (req, res) => {
    const listPage = getPageOffset(req.query.page, SCHOOL_RECORDS_PAGE_SIZE)
    if (!listPage) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const diaries = await diaryService.getDiariesPage({ offset, limit: SCHOOL_RECORDS_PAGE_SIZE })

    const pagination = getPagination({ page, pageSize: SCHOOL_RECORDS_PAGE_SIZE, totalCount: diaries.count })
    const pageUrl = targetPage => `/cramschool/diaries?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/diaries/index', {
      diaries: diaries.rows,
      isAdmin: req.user.isAdmin,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  deleteDiaryFromList: async (req, res) => {
    const deleted = await diaryService.deleteDiary({ diaryId: req.params.diaryId })
    req.flash(
      deleted ? 'success_messages' : 'error_messages',
      deleted ? '已成功刪除教師日誌' : '找不到教師日誌'
    )
    return res.redirect('/cramschool/diaries')
  },

  getCourseDiariesPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const listPage = getPageOffset(req.query.page, SCHOOL_RECORDS_PAGE_SIZE)
    if (!listPage) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const result = await diaryService.getCourseDiariesPage({ courseId, offset, limit: SCHOOL_RECORDS_PAGE_SIZE })
    if (!result) return res.redirect('/cramschool/courses')
    const { course, diaries } = result

    const pagination = getPagination({ page, pageSize: SCHOOL_RECORDS_PAGE_SIZE, totalCount: diaries.count })
    const pageUrl = targetPage => `/cramschool/courses/${courseId}/diaries?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/diaries/course-list', {
      diaries: diaries.rows,
      course,
      isDiaryNotExist: diaries.count === 0,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getDiaryDetailsPage: async (req, res) => {
    const { courseId, diaryId } = req.params
    const diary = await diaryService.getDiaryDetails({ courseId, diaryId })
    if (!diary) return res.redirect('/cramschool/courses')

    return res.render('school/diaries/detail', { diary })
  },

  getCreateDiaryPage: async (req, res) => {
    const result = await diaryService.getCreateDiaryFormData({ courseId: req.params.courseId, userId: req.user.id })
    if (!result) return res.redirect('/cramschool/courses')

    return res.render('school/diaries/create', result)
  },

  createDiary: async (req, res) => {
    const courseId = req.params.courseId
    const { date, subject, content } = req.body ?? {}
    const created = await diaryService.createDiary({ courseId, userId: req.user.id, date, subject, content })
    req.flash(
      created ? 'success_messages' : 'error_messages',
      created ? '已成功建立教師日誌' : '找不到可建立日誌的課程或教師資料'
    )
    return res.redirect(created ? `/cramschool/courses/${courseId}/diaries` : '/cramschool/courses')
  },

  deleteDiary: async (req, res) => {
    const { courseId, diaryId } = req.params
    const deleted = await diaryService.deleteDiary({ courseId, diaryId })
    req.flash(
      deleted ? 'success_messages' : 'error_messages',
      deleted ? '已成功刪除教師日誌' : '在這門課程找不到該筆日誌'
    )
    return res.redirect(`/cramschool/courses/${courseId}/diaries`)
  }
}

module.exports = diaryController
