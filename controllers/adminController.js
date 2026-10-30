const db = require('../models')
const Course = db.Course
const User = db.User
const Calendar = db.Calendar
const ExtraFee = db.ExtraFee
const moment = require('moment')
const pageLimit = 12

const adminController = {
  // 後臺首頁
  getSchoolIndexPage: (req, res) => {
    return res.render('admin/cramschool')
  },

  // 課程行事曆相關程式碼
  getCalendar : (req, res) => {
    let offset = 0
    if (req.query.page) {
      offset = (req.query.page - 1) * pageLimit
    }
    Promise.all([
      Calendar.max('period', {
        where: {
          CourseId: req.params.id
        }
      }),
      Course.findByPk(req.params.id),
      Calendar.findAndCountAll({
        where: {
          CourseId: req.params.id
        },
        offset: offset,
        limit: pageLimit
      })
    ]).then(([calendarPeriod, course, result]) =>{
      if (course === null) {
        console.log('Not found')
        res.redirect('/admin/courses')
      } else if (course.dataValues.isActive === false) {
        console.log('Not open!')
        res.redirect('/admin/courses')
      } else {
        let isPeriodNotEqualOne = true
        if (calendarPeriod === 1) {
          isPeriodNotEqualOne = false
        }
        const page = Number(req.query.page) || 1
        const pages = Math.ceil(result.count / pageLimit)
        const totalPage = Array.from({ length: pages }).map((item, index) => index + 1)
        const prev = page - 1 < 1 ? 1 : page - 1
        const next = page + 1 > pages ? pages : page + 1
        const calendars = result.rows.map(r => ({
          ...r.dataValues
        }))
        return res.render('admin/course', { 
          course: course.toJSON(), 
          calendars: calendars, 
          isPeriodNotEqualOne: isPeriodNotEqualOne,
          page: page,
          totalPage: totalPage,
          prev: prev,
          next: next
        })
      }
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

  editCalendar: (req, res) => {
    Calendar.findByPk(req.params.calendarId, {
      include: [Course]
    }).then(calendar => {
      let url = '/admin/courses/'+ String(req.params.courseId) + '/calendar'
      if (calendar === null) {
        console.log('Not found!')
        res.redirect(url)
      } else {
        if (calendar.isActive === false) {
          console.log('Not open!')
          res.redirect(url)
        } else {
          return res.render('admin/editcalendar',{ calendar: calendar.toJSON() })
        }
      }
    })
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