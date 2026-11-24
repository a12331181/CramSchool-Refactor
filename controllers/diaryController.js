const responses = require('../constants/messages/diary')
const { validateUploads, recordContents } = require('../services/recordAttachmentService')
const { sendPageError } = require('../utils/pageError')
const diaryService = require('../services/diaryService')
const { getPagination, getPaginationLinks, getPageOffset } = require('../utils/pagination')
const { SCHOOL_RECORDS_PAGE_SIZE } = require('../constants/pagination')

const diaryController = {
  getDiaryListPage: async (req, res) => {
    const listPage = getPageOffset(req.query.page, SCHOOL_RECORDS_PAGE_SIZE)
    if (!listPage) {
      return sendPageError(res, 400, responses.getDiaryListPageInvalidPage)
    }
    const { page, offset } = listPage

    const diaries = await diaryService.getDiariesPage({ offset, limit: SCHOOL_RECORDS_PAGE_SIZE, viewer: req.user })

    const pagination = getPagination({ page, pageSize: SCHOOL_RECORDS_PAGE_SIZE, totalCount: diaries.count })
    const pageUrl = targetPage => `/cramschool/diaries?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/diaries/index', {
      diaries: diaries.rows.map((record, index) => ({ ...record, rowNumber: offset + index + 1 })),
      showDeleteColumn: diaries.rows.some(diary => diary.canDelete),
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getCourseDiariesPage: async (req, res) => {
    const courseId = Number(req.params.courseId)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.getCourseDiariesPageInvalidCourse)
    }

    const listPage = getPageOffset(req.query.page, SCHOOL_RECORDS_PAGE_SIZE)
    if (!listPage) {
      return sendPageError(res, 400, responses.getCourseDiariesPageInvalidPage)
    }
    const { page, offset } = listPage

    const result = await diaryService.getCourseDiariesPage({ courseId, offset, limit: SCHOOL_RECORDS_PAGE_SIZE, viewer: req.user })
    if (!result) return res.redirect('/cramschool/courses')
    const { course, diaries } = result

    const pagination = getPagination({ page, pageSize: SCHOOL_RECORDS_PAGE_SIZE, totalCount: diaries.count })
    const pageUrl = targetPage => `/cramschool/courses/${courseId}/diaries?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/diaries/course-list', {
      diaries: diaries.rows.map((record, index) => ({ ...record, rowNumber: offset + index + 1 })),
      course,
      isDiaryNotExist: diaries.count === 0,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getDiaryDetailsPage: async (req, res) => {
    const { courseId, diaryId } = req.params
    const diary = await diaryService.getDiaryDetails({ courseId, diaryId })
    if (!diary) return res.redirect('/cramschool/courses')

    return res.render('school/diaries/detail', { diary, ...await recordContents(diary, 'diary', req.baseUrl + req.path) })
  },

  getCreateDiaryPage: async (req, res) => {
    const course = await diaryService.getCreateDiaryFormData({ courseId: req.params.courseId, userId: req.user.id })
    if (!course) return res.redirect('/cramschool/courses')

    return res.render('school/diaries/create', { course })
  },

  createDiary: async (req, res) => {
    const courseId = req.params.courseId
    const { date, subject, content } = req.body ?? {}
    if (![date, subject, content].every(value => typeof value === 'string' && value.trim()) ||
        subject.length > 40 || Buffer.byteLength(content) > 60_000 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return sendPageError(res, 400, responses.createDiaryInvalidDateContent)
    }
    const attachments = await validateUploads(req.files)
    if (!attachments) return sendPageError(res, 400, responses.createDiaryMessageAttachment)
    const created = await diaryService.createDiary({ courseId, userId: req.user.id, date, subject, content, attachments, richText: req.body.format === 'simple' })
    req.flash(
      created ? 'success_messages' : 'error_messages',
      created ? responses.createDiarySavedTeacherDiary : responses.createDiaryNotFoundTeacherCourseProfile
    )
    return res.redirect(303, created ? `/cramschool/courses/${courseId}/diaries/${created.id}` : '/cramschool/courses')
  },

  deleteDiary: async (req, res) => {
    const { courseId, diaryId } = req.params
    const result = await diaryService.deleteDiary({ courseId, diaryId, viewer: req.user })
    if (result.code === 'FORBIDDEN') return sendPageError(res, 403, responses.deleteDiaryMessageDiary)
    req.flash(result.ok ? 'success_messages' : 'error_messages', result.ok ? responses.deleteDiarySavedTeacherDiary : responses.deleteDiaryNotFoundDiary)
    return res.redirect(303, courseId === undefined ? '/cramschool/diaries' : `/cramschool/courses/${courseId}/diaries`)
  }
}

module.exports = diaryController
