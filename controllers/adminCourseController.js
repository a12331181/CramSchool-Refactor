const { readUnsignedInteger } = require('../utils/formNumbers')
const { COURSE_PREFIX_LETTERS } = require('../constants/referenceNumbers')
const courseService = require('../services/courseService')
const { getPagination, getPaginationLinks } = require('../utils/pagination')
const { COURSE_TIMES, COURSE_TYPES, MAX_COURSE_PRICE } = require('../constants/courseOptions')
const pageLimit = 12

const COURSE_SETTINGS_MESSAGES = Object.freeze({
  INVALID_TIME: '上課時長只能是 60、90 或 120 分鐘',
  INVALID_TYPE: '計費方式不正確',
  INVALID_PRICE: '價格必須是有效的非負整數',
  INVALID_TEACHER_ID: '教師 ID 不正確'
})

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
    const page = Number(req.query.page || 1)

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger((page - 1) * pageLimit)
    ) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }

    const result = await courseService.getAdminCoursesPage({
      page,
      pageSize: pageLimit
    })

    const pagination = getPagination({
      page,
      pageSize: pageLimit,
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
      const errorMessages = {
        INVALID_NAME: '課程名稱必填，且不可超過 255 字',
        INVALID_COURSE_PREFIX: '請選擇兩個大寫英文字母作為課程編號開頭',
        COURSE_NUMBER_EXHAUSTED: '這個課程前綴的編號已用完，請改用其他前綴',
        ...COURSE_SETTINGS_MESSAGES,
        TEACHER_NOT_FOUND: '找不到所選教師，請重新選擇'
      }

      const status = result.reason === 'COURSE_NUMBER_EXHAUSTED' ? 409 : 400
      return res.status(status).send(
        errorMessages[result.reason] ?? '課程資料不正確'
      )
    }

    req.flash('success_messages', `成功建立課程｜${result.courseNo}`)
    return res.redirect('/admin/courses')
  },

  getEditCoursePage: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
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
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const body = req.body ?? {}

    const result = await courseService.updateCourse(courseId, readCourseSettings(body))

    if (!result.ok) {
      if (Object.hasOwn(COURSE_SETTINGS_MESSAGES, result.code)) {
        return res.status(400).send(COURSE_SETTINGS_MESSAGES[result.code])
      }

      const errorMessages = {
        COURSE_NOT_FOUND: '找不到課程資料',
        COURSE_CLOSED: '課程已關閉，無法修改',
        TEACHER_NOT_FOUND: '找不到所選教師'
      }

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? '無法修改課程'
      )

      return res.redirect('/admin/courses')
    }

    req.flash('success_messages', '成功修改課程')
    return res.redirect('/admin/courses')
  },

  deleteCourse: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await courseService.deleteCourse(courseId)

    if (!result.ok) {
      const errorMessages = {
        COURSE_NOT_FOUND: '找不到課程資料',
        COURSE_HAS_TUITION_BILL_ITEMS: '課程已有月帳單明細，無法刪除。請改用「關閉課程」保留歷史資料。',
        COURSE_HAS_SESSION_RECORDS: '課程已有課堂紀錄，無法刪除，請改用關閉課程',
        COURSE_HAS_ENROLLMENTS: '課程已有學生選課，請改用關閉課程',
        COURSE_HAS_TUITIONS: '課程已有學費帳單，無法刪除',
        COURSE_HAS_DIARIES: '課程已有教學日誌，無法刪除',
        COURSE_HAS_CLOSED_CALENDARS: '課程已有關閉的課堂紀錄，無法刪除',
        COURSE_HAS_ATTENDANCE: '課程已有點名紀錄，無法刪除'
      }

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? '無法刪除課程'
      )

      return res.redirect('/admin/courses')
    }

    req.flash('success_messages', '已成功刪除課程')
    return res.redirect('/admin/courses')
  },

  closeCourse: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await courseService.setCourseActive(
      courseId,
      false
    )

    if (!result.ok) {
      req.flash('error_messages', '找不到課程資料')
      return res.redirect('/admin/courses')
    }

    req.flash(
      'success_messages',
      result.changed
        ? '已成功關閉課程'
        : '課程已經是關閉狀態'
    )

    return res.redirect('/admin/courses')
  },

  openCourse: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await courseService.setCourseActive(
      courseId,
      true
    )

    if (!result.ok) {
      req.flash('error_messages', '找不到課程資料')
      return res.redirect('/admin/courses')
    }

    req.flash(
      'success_messages',
      result.changed
        ? '已成功開啟課程'
        : '課程已經是開啟狀態'
    )

    return res.redirect('/admin/courses')
  },
}

module.exports = adminCourseController