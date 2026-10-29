const db = require('../models')
const Course = db.Course
const User = db.User
const Teacher = db.Teacher
const Calendar = db.Calendar
const ExtraFee = db.ExtraFee
const moment = require('moment')
const pageLimit = 12
const courseService = require('../services/courseService')
const { getPagination } = require('../utils/pagination')
const {COURSE_TIMES, COURSE_TYPES} = require('../constants/courseOptions')

const adminController = {
  // 後臺首頁
  getSchoolIndexPage: (req, res) => {
    return res.render('admin/cramschool')
  },

  // 課程相關程式碼
  getCourses: async (req, res) => {
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

    if (page > pagination.totalPages) {
      return res.redirect(
        `/admin/courses?page=${pagination.totalPages}`
      )
    }

    return res.render('admin/courses', {
      courses: result.rows,
      ...pagination
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
    return res.render('admin/createcourse', {
      teachers: formData.teachers,
      typeList,
      timeList
    })
  },

  postCourse: async (req, res) => {
    const body = req.body ?? {}
    const numericFields = ['amounts', 'price', 'teacherId']

    if (numericFields.some(field =>
      typeof body[field] !== 'string' ||
      body[field].trim() === ''
    )) {
      return res.status(400).send('堂數、價格與教師 ID 必須填寫數字')
    }

    const result = await courseService.createCourse({
      name: body.name,
      time: body.time,
      type: body.type,
      amounts: Number(body.amounts),
      price: Number(body.price),
      teacherId: Number(body.teacherId)
    })

    if (!result.created) {
      const errorMessages = {
        INVALID_NAME: '課程名稱必填，且不可超過 255 字',
        INVALID_TIME: '上課時長只能是 60、90 或 120 分鐘',
        INVALID_TYPE: '計費方式不正確',
        INVALID_AMOUNTS: '堂數必須是 1 到 36 的整數',
        INVALID_PRICE: '價格必須是有效的非負整數',
        INVALID_TEACHER_ID: '教師 ID 不正確',
        TEACHER_NOT_FOUND: '找不到所選教師，請重新選擇'
      }

      return res.status(400).send(
        errorMessages[result.reason] ?? '課程資料不正確'
      )
    }

    req.flash('success_messages', '成功建立課程')
    return res.redirect('/admin/courses')
  },

  editCourse: async (req, res) => {
    const courseId = Number(req.params.id)

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

    return res.render('admin/createcourse', {
      course: result.course,
      teachers: result.teachers,
      typeList,
      timeList
    })
  },

  putCourse: async (req, res) => {
    const courseId = Number(req.params.id)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const body = req.body ?? {}

    if (!Object.values(COURSE_TIMES).includes(body.time)) {
      return res.status(400).send('上課時長不正確')
    }

    if (!Object.values(COURSE_TYPES).includes(body.type)) {
      return res.status(400).send('計費方式不正確')
    }

    if (
      typeof body.price !== 'string' ||
      body.price.trim() === '' ||
      typeof body.teacherId !== 'string' ||
      body.teacherId.trim() === ''
    ) {
      return res.status(400).send('請填寫有效的價格與教師資料')
    }

    const price = Number(body.price)
    const teacherId = Number(body.teacherId)

    if (!Number.isSafeInteger(price) || price < 0 || price > 2147483647) {
      return res.status(400).send('價格必須是有效的台幣整數元')
    }

    if (!Number.isSafeInteger(teacherId) || teacherId < 1) {
      return res.status(400).send('教師 ID 必須是正整數')
    }

    const result = await courseService.updateCourse(courseId, {
      time: body.time,
      type: body.type,
      price,
      teacherId
    })

    if (!result.ok) {
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
    const courseId = Number(req.params.id)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await courseService.deleteCourse(courseId)

    if (!result.ok) {
      const errorMessages = {
        COURSE_NOT_FOUND: '找不到課程資料',
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
    const courseId = Number(req.params.id)

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
    const courseId = Number(req.params.id)

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