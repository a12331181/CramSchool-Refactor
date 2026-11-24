const responses = require('../constants/messages/adminCourse')
const { sendPageError } = require('../utils/pageError')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')
const { readUnsignedInteger } = require('../utils/formNumbers')
const { COURSE_PREFIX_LETTERS } = require('../constants/referenceNumbers')
const courseService = require('../services/courseService')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')
const { COURSE_TIMES, COURSE_TYPES, MAX_COURSE_PRICE } = require('../constants/courseOptions')

const COURSE_SETTINGS_MESSAGES = responses.courseSettings

function readCourseSettings(body) {
  return {
    time: body.time,
    type: body.type,
    price: readUnsignedInteger(body.price),
    teacherId: readUnsignedInteger(body.teacherId)
  }
}

const adminCourseController = {
// 課程相關程式碼
  getCourseListPage: async (req, res) => {
    const listPage = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)
    if (!listPage) {
      return sendPageError(res, 400, responses.getCourseListPageInvalidPage)
    }
    const { page } = listPage

    const result = await courseService.getAdminCoursesPage({
      page,
      pageSize: DIRECTORY_PAGE_SIZE
    })

    const pagination = getPagination({
      page,
      pageSize: DIRECTORY_PAGE_SIZE,
      totalCount: result.count
    })

    const pageUrl = targetPage => `/admin/courses?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('admin/courses/index', {
      courses: result.rows,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getCreateCoursePage: async (req, res) => {
    const formData = await courseService.getCourseFormData()

    const typeList = Object.values(COURSE_TYPES).map(type => ({
      type
    }))

    const timeList = Object.values(COURSE_TIMES).map(time => ({
      time
    }))
    return res.render('admin/courses/form', {
      teachers: formData.teachers,
      prefixLetters: COURSE_PREFIX_LETTERS,
      typeList,
      timeList,
      maxPrice: MAX_COURSE_PRICE
    })
  },

  createCourse: async (req, res) => {
    const body = req.body ?? {}
    const { coursePrefixFirst, coursePrefixSecond } = body
    const coursePrefix = [coursePrefixFirst, coursePrefixSecond].every(letter => COURSE_PREFIX_LETTERS.includes(letter))
      ? coursePrefixFirst + coursePrefixSecond
      : null

    const result = await courseService.createCourse({
      name: body.name,
      coursePrefix,
      ...readCourseSettings(body)
    })

    if (!result.created) {
      const errorMessages = responses.createCourseErrors

      const status = result.reason === 'COURSE_NUMBER_EXHAUSTED' ? 409 : 400
      return sendPageError(res, status, errorMessages[result.reason] ?? responses.createCourseInvalidCourseProfile)
    }

    req.flash('success_messages', responses.createCourseSavedCourse(result.courseNo))
    return res.redirect('/admin/courses')
  },

  getEditCoursePage: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.getEditCoursePageInvalidCourse)
    }

    const result = await courseService.getCourseEditData(courseId)

    if (!result) {
      return res.redirect('/admin/courses')
    }

    const typeList = Object.values(COURSE_TYPES).map(type => ({
      type
    }))

    const timeList = Object.values(COURSE_TIMES).map(time => ({
      time
    }))

    return res.render('admin/courses/form', {
      course: result.course,
      teachers: result.teachers,
      typeList,
      timeList,
      maxPrice: MAX_COURSE_PRICE
    })
  },

  updateCourse: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.updateCourseInvalidCourse)
    }

    const body = req.body ?? {}

    const result = await courseService.updateCourse(courseId, readCourseSettings(body))

    if (!result.ok) {
      if (Object.hasOwn(COURSE_SETTINGS_MESSAGES, result.code)) {
        return sendPageError(res, 400, COURSE_SETTINGS_MESSAGES[result.code])
      }

      const errorMessages = responses.updateCourseErrors

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? responses.updateCourseUnavailableCourse
      )

      return res.redirect('/admin/courses')
    }

    req.flash('success_messages', responses.updateCourseSavedCourse)
    return res.redirect('/admin/courses')
  },

  deleteCourse: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.deleteCourseInvalidCourse)
    }

    const result = await courseService.deleteCourse(courseId)

    if (!result.ok) {
      const errorMessages = responses.deleteCourseErrors

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? responses.deleteCourseUnavailableCourse
      )

      return res.redirect('/admin/courses')
    }

    req.flash('success_messages', responses.deleteCourseSavedCourse)
    return res.redirect('/admin/courses')
  },

  closeCourse: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.closeCourseInvalidCourse)
    }

    const result = await courseService.setCourseActive(
      courseId,
      false
    )

    if (!result.ok) {
      req.flash('error_messages', responses.closeCourseNotFoundCourseProfile)
      return res.redirect('/admin/courses')
    }

    req.flash(
      'success_messages',
      result.changed
        ? responses.closeCourseSavedCourse
        : responses.closeCourseUnchangedCourseStatus
    )

    return res.redirect('/admin/courses')
  },

  openCourse: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return sendPageError(res, 400, responses.openCourseInvalidCourse)
    }

    const result = await courseService.setCourseActive(
      courseId,
      true
    )

    if (!result.ok) {
      req.flash('error_messages', responses.openCourseNotFoundCourseProfile)
      return res.redirect('/admin/courses')
    }

    req.flash(
      'success_messages',
      result.changed
        ? responses.openCourseSavedCourse
        : responses.openCourseUnchangedCourseStatus
    )

    return res.redirect('/admin/courses')
  },
}

module.exports = adminCourseController
