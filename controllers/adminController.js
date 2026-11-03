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
    Calendar.max('period', {
      where: {
        CourseId: req.params.id
      }
    }).then(period => {
      Course.findByPk(req.params.id, {
        include: { 
          model: Calendar, where: { period: period, isActive: false }
        }
      }).then(course => {
        let url = '/admin/courses/'+ String(req.params.id) + '/calendar'
        if (course === null) {
          console.log('Not found!')
          req.flash('error_messages', '目前已為最新一期課程行事曆，故新增失敗')
          res.redirect(url)
        } else {
          if (course.amounts === course.Calendars.length) {
            console.log('The course is end!')
            let calendarList = []
            for (let i = 0; i < Number(course.amounts); i++) {
              calendarList.push(
                {
                  date: moment().format('YYYY-MM-DD'), //日期,內容為預設值
                  content: i,
                  CourseId: course.id,
                  period: period + 1
                }
              )
            }
            Calendar.bulkCreate(calendarList).then(calendars => {
              req.flash('success_messages', '已成功新增下一期課程行事曆')
              res.redirect(url)
            }) 
          } else {
            console.log('The course is not end!')
            req.flash('error_messages', '此期課程尚未結束，故無法新增下一期課程行事曆')
            res.redirect(url)
          }
        }
      })
    })
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

  putCalendar: (req, res) => {
    return Calendar.findByPk(req.params.calendarId)
      .then((calendar) => {
        calendar.update({
          date: req.body.date,
          content: req.body.content
        })
        .then((calendar) => {
          let url = '/admin/courses/'+ String(req.params.courseId) + '/calendar'
          req.flash('success_messages', '已成功更新課程行事曆')
          res.redirect(url)
        })
      })
  },

  deleteCalendars: (req, res) => {
    Calendar.max('period', {
      where: {
        CourseId: req.params.id
      }
    }).then(period => {
      Calendar.findAll({
        where: {
          period: period,
          CourseId: req.params.id,
          isActive: false
        }
      }).then(calendars => {
        let url = '/admin/courses/'+ String(req.params.id) + '/calendar'
        if (calendars.length !== 0) {
          req.flash('error_messages', '此期課程已進行，故刪除失敗')
          res.redirect(url)
        } else {
          Calendar.destroy({
            where: {
              CourseId: req.params.id,
              period: period
            }
          }).then(() => {
            req.flash('success_messages', '已成功刪除最新一期課程')
            res.redirect(url)
          })
        }
      })
    })
  },

  closeCalendar: (req, res) => {
    Calendar.findByPk(req.params.calendarId)
      .then(calendar => {
        calendar.update({
          isActive: false
        }).then(() => {
          req.flash('success_messages', '已成功關閉行事曆')
          return res.redirect('back')
        })
    })
  },

  openCalendar: (req, res) => {
    Calendar.findByPk(req.params.calendarId)
      .then(calendar => {
        calendar.update({
          isActive: true
        }).then(() => {
          req.flash('success_messages', '已成功開啟行事曆')
          return res.redirect('back')
        })
    })
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