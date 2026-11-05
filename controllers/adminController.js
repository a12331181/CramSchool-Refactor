const db = require('../models')
const Course = db.Course
const User = db.User
const Calendar = db.Calendar
const ExtraFee = db.ExtraFee
const moment = require('moment')
const pageLimit = 12
const calendarService = require('../services/calendarService')
const { getPagination } = require('../utils/pagination')
const { formatTaipeiDateTime } = require('../utils/date')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const CALENDAR_STATUS_LABELS = Object.freeze({
  [CALENDAR_STATUS.SCHEDULED]: '已排定',
  [CALENDAR_STATUS.COMPLETED]: '已完成',
  [CALENDAR_STATUS.CANCELLED]: '已取消'
})

const adminController = {
  // 後臺首頁
  getSchoolIndexPage: (req, res) => {
    return res.render('admin/cramschool')
  },

  // 課程行事曆相關程式碼
  getCalendar: async (req, res) => {
    const courseId = Number(req.params.id)
    const page = Number(req.query.page || 1)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger((page - 1) * pageLimit)
    ) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }

    const result = await calendarService.getCalendarPage({
      courseId,
      page,
      pageSize: pageLimit
    })

    if (!result.ok) {
      const errorMessages = {
        COURSE_NOT_FOUND: '找不到課程資料',
        COURSE_CLOSED: '課程已關閉，暫不提供此操作頁面'
      }

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? '無法取得課程行事曆'
      )

      return res.redirect('/admin/courses')
    }

    const pagination = getPagination({
      page,
      pageSize: pageLimit,
      totalCount: result.count
    })

    if (page > pagination.totalPages) {
      return res.redirect(
        `/admin/courses/${courseId}/calendar?page=${pagination.totalPages}`
      )
    }
    const calendars = result.rows.map(calendar => ({
      ...calendar,

      startAtText:
        formatTaipeiDateTime(calendar.startAt) ?? '待核對',

      endAtText:
        formatTaipeiDateTime(calendar.endAt) ?? '待核對',

      statusText: Object.hasOwn(CALENDAR_STATUS_LABELS, calendar.status)
        ? CALENDAR_STATUS_LABELS[calendar.status]
        : '待核對'
    }))
    return res.render('admin/course', {
      course: result.course,
      calendars,
      isPeriodNotEqualOne: result.latestPeriod > 1,
      ...pagination
    })
  },

  getCreateCalendarPage: async (req, res) => {
    const courseId = Number(req.params.courseId)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await calendarService.getCreateCalendarFormData(courseId)

    if (!result.ok) {
      const errorMessages = {
        COURSE_NOT_FOUND: '找不到課程資料',
        COURSE_CLOSED: '課程已關閉，無法新增課堂'
      }

      req.flash(
        'error_messages',
        errorMessages[result.code] ?? '無法開啟新增課堂頁面'
      )

      return res.redirect('/admin/courses')
    }

    const teachers = result.teachers.map(teacher => ({
      ...teacher,
      isSelected: teacher.id === result.course.TeacherId
    }))

    return res.render('admin/createcalendar', {
      course: result.course,
      teachers
    })
  },

  postNextPeriodCalendar: (req, res) => {
    return res.status(409).send(
      '整期新增功能已停用，課堂將改以實際日期與時段建立。'
    )
  },

  editCalendar: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)

    if (
      !Number.isSafeInteger(courseId) || courseId < 1 ||
      !Number.isSafeInteger(calendarId) || calendarId < 1
    ) {
      return res.status(400).send('課程與課堂 ID 必須是正整數')
    }

    const calendar = await calendarService.getLegacyCalendarEditData(
      courseId,
      calendarId
    )

    if (!calendar) {
      return res.status(409).send(
        '此課堂目前無法使用舊日期表單修改，請返回課堂列表確認'
      )
    }

    return res.render('admin/editcalendar', { calendar })
  },

  putCalendar: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)
    const { date, content } = req.body ?? {}

    const result = await calendarService.updateLegacyCalendar(
      courseId,
      calendarId,
      { date, content }
    )

    if (!result.ok) {
      const errors = {
        INVALID_COURSE_ID: [400, '課程 ID 必須是正整數'],
        INVALID_CALENDAR_ID: [400, '課堂 ID 必須是正整數'],
        INVALID_LEGACY_DATE: [400, '日期格式不正確'],
        INVALID_CONTENT: [400, '上課內容必須填寫，且不能超過 40 個字元'],
        COURSE_NOT_FOUND: [404, '找不到課程'],
        COURSE_CLOSED: [409, '課程已關閉，無法修改課堂'],
        LEGACY_CALENDAR_UNAVAILABLE: [
          409,
          '此課堂目前無法使用舊表單修改，請返回列表確認'
        ]
      }

      const [status, message] = errors[result.code] ?? [500, '更新課堂失敗']
      return res.status(status).send(message)
    }

    req.flash('success_messages', '已成功更新課堂資料')
    return res.redirect(303, `/admin/courses/${courseId}/calendar`)
  },

  deleteCalendars: (req, res) => {
    return res.status(409).send(
      '整期刪除功能已停用，既有課堂紀錄會保留。'
    )
  },

  closeCalendar: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)

    const result = await calendarService.closeLegacyCalendar(
      courseId,
      calendarId
    )

    if (!result.ok) {
      const errors = {
        INVALID_COURSE_ID: [400, '課程 ID 必須是正整數'],
        INVALID_CALENDAR_ID: [400, '課堂 ID 必須是正整數'],
        COURSE_NOT_FOUND: [404, '找不到課程'],
        COURSE_CLOSED: [409, '課程已關閉，無法操作點名狀態'],
        LEGACY_CALENDAR_UNAVAILABLE: [
          409,
          '此課堂目前無法使用舊點名操作，請返回列表確認'
        ]
      }

      const [status, message] = errors[result.code] ?? [500, '關閉點名失敗']
      return res.status(status).send(message)
    }

    const message = result.changed
      ? '已成功關閉此課堂的點名'
      : '此課堂的點名原本就已關閉'

    req.flash('success_messages', message)

    return res.redirect(
      303,
      `/admin/courses/${courseId}/calendar`
    )
  },

  openCalendar: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)

    const result = await calendarService.openLegacyCalendar(
      courseId,
      calendarId
    )

    if (!result.ok) {
      const errors = {
        INVALID_COURSE_ID: [400, '課程 ID 必須是正整數'],
        INVALID_CALENDAR_ID: [400, '課堂 ID 必須是正整數'],
        COURSE_NOT_FOUND: [404, '找不到課程'],
        COURSE_CLOSED: [409, '課程已關閉，無法操作點名狀態'],
        LEGACY_CALENDAR_UNAVAILABLE: [
          409,
          '此課堂目前無法使用舊點名操作，請返回列表確認'
        ]
      }

      const [status, message] = errors[result.code] ?? [500, '開啟點名失敗']
      return res.status(status).send(message)
    }

    const message = result.changed
      ? '已成功開啟此課堂的點名'
      : '此課堂的點名原本就已開啟'

    req.flash('success_messages', message)

    return res.redirect(
      303,
      `/admin/courses/${courseId}/calendar`
    )
  },

  // 使用者相關程式碼
  getUsers: (req, res) => {
    return User.findAll({raw: true}).then(users => {
      return res.render('admin/users', { users: users })
    })
  },

  toggleAdmin: (req, res) => {
    return User.findByPk(req.params.id)
      .then((user) => {
        user.update({
          isAdmin: !user.isAdmin
        })
        .then((user) => {
          req.flash('success_messages', '使用者權限已更新')
          res.redirect('/admin/users')
        })
      })
  },
  
  getExtraFees: (req, res) => {
    ExtraFee.findAll({
      raw: true,
      nest: true
    }).then(extrafees => {
      res.render('admin/extrafee', { extrafees: extrafees })
    })
  },

  getCreateExtraFeePage: (req, res) => {
    return res.render('admin/createextrafee')
  },

  getEditExtraFeePage: (req, res) => {
    ExtraFee.findByPk(req.params.id, {
      raw: true,
      nest: true
    }).then(extrafee => {
      return res.render('admin/createextrafee', { extrafee: extrafee })
    })
  },

  postExtraFee: (req, res) => {
    ExtraFee.create({
      name: req.body.name,
      price: req.body.price,
    }).then((extrafee) => {
      req.flash('success_messages', '額外費用已成功被創建')
      res.redirect('/admin/extrafees')
    })
  },

  putExtraFee: (req, res) => {
    ExtraFee.findByPk(req.params.id)
      .then((extrafee) => {
        extrafee.update({
          name: req.body.name,
          price: req.body.price
        }).then(() => {
          req.flash('success_messages', '已成功更新額外費用')
          res.redirect('/admin/extrafees')
        })
      })
  },
}   

module.exports = adminController