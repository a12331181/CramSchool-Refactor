const db = require('../models')
const Course = db.Course
const User = db.User
const Teacher = db.Teacher
const Student = db.Student
const Enrollment = db.Enrollment
const Calendar = db.Calendar
const Attend = db.Attend
const ExtraFee = db.ExtraFee
const fs = require('fs')
const moment = require('moment')
const pageLimit = 12

const adminController = {
  // 後臺首頁
  getSchoolIndexPage: (req, res) => {
    return res.render('admin/cramschool')
  },

  // 課程相關程式碼
  getCourses : (req, res) => {
    let offset = 0
    if (req.query.page) {
      offset = (req.query.page - 1) * pageLimit
    }
    return Course.findAndCountAll({
      raw: true,
      nest: true,
      offset: offset,
      limit: pageLimit,
      include: [Teacher],
      order: [['isActive', 'DESC']]  
    }).then(courses =>{
      const page = Number(req.query.page) || 1
      const pages = Math.ceil(courses.count / pageLimit)
      const totalPage = Array.from({ length: pages }).map((item, index) => index + 1)
      const prev = page - 1 < 1 ? 1 : page - 1
      const next = page + 1 > pages ? pages : page + 1
      return res.render('admin/courses', { 
        courses: courses.rows, 
        page: page,
        totalPage: totalPage,
        prev: prev,
        next: next,
      })
    })
  },

  getCreateCoursePage: (req, res) => {
    const typeList = [
      { id: 1, type: '依堂數計費' },
      { id: 2, type: '依月計費' },
    ]
    const timeList = [
      { id: 1, time: '60' },
      { id: 2, time: '90' },
      { id: 3, time: '120' },
    ]
    Teacher.findAll({
      raw: true,
      nest: true
    }).then(teachers => {
      return res.render('admin/createcourse', {
        teachers: teachers,
        timeList: timeList,
        typeList: typeList
      })
    })
  },

  postCourse: (req, res) => {
    return Course.create({
      name: req.body.name,
      time: req.body.time,
      type: req.body.type,
      amounts: req.body.amounts,
      price: req.body.price,
      TeacherId: req.body.teacherId
    }).then((course) => {
      course = course.toJSON()
      let calendarList = []
      for (let i = 0; i < Number(course.amounts); i++) {
        calendarList.push(
          {
            date: moment().format('YYYY-MM-DD'), //日期,內容為預設值
            content: i,
            CourseId: course.id,
            period: 1
          }
        )
      }
      Calendar.bulkCreate(calendarList).then(calendars => {
        req.flash('success_messages', '課程已成功被創建')
        res.redirect('/admin/courses')
      }) 
    })
  },

  editCourse: (req, res) => {
    const typeList = [
      { id: 1, type: '依堂數計費' },
      { id: 2, type: '依月計費' },
    ]
    const timeList = [
      { id: 1, time: '60' },
      { id: 2, time: '90' },
      { id: 3, time: '120' },
    ]
    Promise.all([
      Teacher.findAll({
        raw: true,
        nest: true
      }),
      Course.findByPk(req.params.id)
    ]).then(([teachers, course]) => {
      if (course === null) {
        console.log('Not found!')
        res.redirect('/admin/courses')
      } else if (course.dataValues.isActive === false) {
        console.log('Not open!')
        res.redirect('/admin/courses')
      } else {
        return res.render('admin/createcourse', { 
          course: course.toJSON(),
          teachers: teachers,
          typeList: typeList,
          timeList: timeList
        })
      }
    })
  },

  putCourse: (req, res) => {
    return Course.findByPk(req.params.id)
      .then((course) => {
        course.update({
          name: req.body.name,
          time: req.body.time,
          type: req.body.type,
          amounts: req.body.amounts,
          price: req.body.price,
          TeacherId: req.body.teacherId
        })
        .then((course) => {
          req.flash('success_messages', '課程已成功被修改')
          res.redirect('/admin/courses')
        })
      })
  },

  deleteCourse: (req, res) => {
    Course.findByPk(req.params.id, {
      include: { model: Calendar, where: { isActive: false }}
    }).then((course) => {
      if (course === null) {
        Course.findByPk(req.params.id).then(needDeleteCourse => {
          needDeleteCourse.destroy().then(() => {
            req.flash('success_messages', '已成功刪除課程')
            res.redirect('/admin/courses')
          })
        })
      } else {
        req.flash('error_messages', '課程已在進行，故無法刪除')
        res.redirect('/admin/courses')
      }
    })
  },

  closeCourse: (req, res) => {
    Course.findByPk(req.params.id)
      .then(course => {
        course.update({
          isActive: false
        }).then(() => {
          req.flash('success_messages', '已成功關閉課程')
          return res.redirect('back')
        })
    })
  },

  openCourse: (req, res) => {
    Course.findByPk(req.params.id)
      .then(course => {
        course.update({
          isActive: true
        }).then(() => {
          req.flash('success_messages', '已成功開啟課程')
          return res.redirect('back')
        })
    })
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

  // 學生相關程式碼
  getStudents: (req, res) => {
    let offset = 0
    const whereQuery = {}
    let courseId = ''
    if (req.query.page) {
      offset = (Number(req.query.page) - 1) * pageLimit
    }
    if (req.query.courseId) {
      courseId = Number(req.query.courseId)
      whereQuery.id = courseId
      Student.findAndCountAll({
        raw: true,
        nest: true,
        include: [{ model: Course, as: 'EnrolledCourses', where: whereQuery }],
        limit: pageLimit,
        offset: offset,
        order: [['status', 'ASC']]  
      }).then(result => {
        const page = Number(req.query.page) || 1
        const pages = Math.ceil(result.count / pageLimit)
        const totalPage = Array.from({ length: pages }).map((v, index) => index + 1)
        const prev = page - 1 < 1 ? 1 : page - 1
        const next = page + 1 > pages ? pages : page + 1
        Course.findAll({
          raw: true,
          nest: true
        }).then(courses => {
          return res.render('admin/students', { 
            students: result.rows,
            courses: courses,
            courseId: whereQuery.id,
            page: page,
            totalPage: totalPage,
            prev: prev,
            next: next,
          })
        })
      })
    } else {
      Student.findAndCountAll({
        raw: true,
        nest: true,
        limit: pageLimit,
        offset: offset,
        order: [['status', 'ASC']]  
      }).then(result => {
        const page = Number(req.query.page) || 1
        const pages = Math.ceil(result.count / pageLimit)
        const totalPage = Array.from({ length: pages }).map((v, index) => index + 1)
        const prev = page - 1 < 1 ? 1 : page - 1
        const next = page + 1 > pages ? pages : page + 1
        Course.findAll({
          raw: true,
          nest: true
        }).then(courses => {
          return res.render('admin/students', { 
            students: result.rows,
            courses: courses,
            page: page,
            totalPage: totalPage,
            prev: prev,
            next: next,
          })
        })
      })
    }
  },

  getCreateStudentPage: (req, res) => {
    const sexList = [
      { id: 1, sex: '男' },
      { id: 2, sex: '女' },
    ]
    const statusList = [
      { id: 1, status: '在學' },
      { id: 2, status: '離開' }
    ]
    const gradeList = [
      { id: 1, grade: '一年級' },
      { id: 2, grade: '二年級' },
      { id: 3, grade: '三年級' },
      { id: 4, grade: '四年級' },
      { id: 5, grade: '五年級' },
      { id: 6, grade: '六年級' },
      { id: 7, grade: '七年級' },
      { id: 8, grade: '八年級' },
      { id: 9, grade: '九年級' },
      { id: 10, grade: '其他' },
    ]
    return res.render('admin/createstudent', {
      sexList: sexList,
      statusList: statusList,
      gradeList: gradeList
    })
  },

  postStudent: (req, res) => {
    file = req.file
    if (file) {
      fs.readFile(file.path, (err, data) => {
        if (err) console.log('Error: ', err)
        fs.writeFile(`upload/${file.originalname}`, data, () => {
          return Student.create({
            name: req.body.name,
            sex: req.body.sex,
            birth: req.body.birth,
            school: req.body.school,
            grade: req.body.grade,
            tel: req.body.tel,
            address: req.body.address,
            image: file ? `/upload/${file.originalname}` : null,
            status: req.body.status,
          }).then((student) => {
            req.flash('success_messages', '成功建立學生資料')
            return res.redirect('/admin/students')
          })
        })
      })
    } else {      
      return Student.create({
        name: req.body.name,
        sex: req.body.sex,
        birth: req.body.birth,
        school: req.body.school,
        grade: req.body.grade,
        tel: req.body.tel,
        address: req.body.address,
        image: null,
        status: req.body.status,
      }).then((student) => {
        req.flash('success_messages', '成功建立學生資料')
        return res.redirect('/admin/students')
      })
    }
  },

  getStudent: (req, res) => {
    Student.findByPk(req.params.id, {
      raw: true,
      nest: true
    }).then(student => {
      if (student === null) {
        console.log('Not found!')
        res.redirect('/admin/students')
      } else {
        return res.render('admin/student', {
          student: student
        })
      }
    })
  },

  editStudent: (req, res) => {
    const sexList = [
      { id: 1, sex: '男' },
      { id: 2, sex: '女' },
    ]
    const statusList = [
      { id: 1, status: '在學' },
      { id: 2, status: '離開' }
    ]
    const gradeList = [
      { id: 1, grade: '一年級' },
      { id: 2, grade: '二年級' },
      { id: 3, grade: '三年級' },
      { id: 4, grade: '四年級' },
      { id: 5, grade: '五年級' },
      { id: 6, grade: '六年級' },
      { id: 7, grade: '七年級' },
      { id: 8, grade: '八年級' },
      { id: 9, grade: '九年級' },
      { id: 10, grade: '其他' },
    ]
    Student.findByPk(req.params.id, {
      raw: true,
      nest: true
    }).then(student => {
      if (student === null) {
        console.log('Not found!')
        res.redirect('/admin/students')
      } else {
        return res.render('admin/createstudent', { 
          student: student,
          statusList: statusList,
          sexList: sexList,
          gradeList: gradeList
        })        
      }
    })
  },

  putStudent: (req, res) => {
    const file = req.file
    if (file) {
      fs.readFile(file.path, (err, data) => {
        if (err) console.log('Error: ', err)
        fs.writeFile(`upload/${file.originalname}`, data, () => {
          return Student.findByPk(req.params.id)
            .then((student) => {
              student.update({
                name: req.body.name,
                sex: req.body.sex,
                birth: req.body.birth,
                school: req.body.school,
                grade: req.body.grade,
                tel: req.body.tel,
                address: req.body.address,
                image: file ? `/upload/${file.originalname}` : student.image,
                status: req.body.status,
              }).then(() => {
                if (student.dataValues.status === '2') {
                  Enrollment.destroy({
                    where: {
                      StudentId: student.dataValues.id
                    }
                  }).then(() => {
                    req.flash('success_messages', '成功更新學生資料及刪除所有註冊課程')
                    return res.redirect('/admin/students')
                  })
                } else {
                  req.flash('success_messages', '成功更新學生資料')
                  return res.redirect('/admin/students')
                }
              })
            })
        })
      })
    } else {
      return Student.findByPk(req.params.id)
        .then((student) => {
          student.update({
            name: req.body.name,
            sex: req.body.sex,
            birth: req.body.birth,
            school: req.body.school,
            grade: req.body.grade,
            tel: req.body.tel,
            address: req.body.address,
            image: student.image,
            status: req.body.status,
          }).then(() => {
            if (student.dataValues.status === '2') {
              Enrollment.destroy({
                where: {
                  StudentId: student.dataValues.id
                }
              }).then(() => {
                req.flash('success_messages', '成功更新學生資料及刪除所有註冊課程')
                return res.redirect('/admin/students')
              })
            } else {
              req.flash('success_messages', '成功更新學生資料')
              return res.redirect('/admin/students')
            }
          })
        })
    }
  },

  deleteStudent: (req, res) => {
    Attend.findAll({
      where: { StudentId: req.params.id }
    }).then(attends => {
      if (attends.length === 0) {
        Student.findByPk(req.params.id)
          .then((student) => {
            student.destroy()
            .then(() => {
              console.log('No data!')
              req.flash('success_messages', '成功刪除學生資料')
              res.redirect('/admin/students')
            })
          })
      } else {
        console.log('Have attend data!')
        req.flash('error_messages', '已有出席紀錄，故無法刪除此學生資料')
        res.redirect('/admin/students')
      }
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