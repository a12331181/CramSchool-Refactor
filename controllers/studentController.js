const studentService = require('../services/studentService')
const db = require('../models')
const Student = db.Student
const Course = db.Course
const Calendar = db.Calendar
const Attend = db.Attend
const pageLimit = 12

const studentController = {
  getStudents: (req, res) => {
    let offset = 0
    let isFilter = false
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
        where: { status: 1 },
        include: [{ model: Course, as: 'EnrolledCourses', where: whereQuery }],
        limit: pageLimit,
        offset: offset
      }).then(result => {
        const page = Number(req.query.page) || 1
        const pages = Math.ceil(result.count / pageLimit)
        const totalPage = Array.from({ length: pages }).map((v, index) => index + 1)
        const prev = page - 1 < 1 ? 1 : page - 1
        const next = page + 1 > pages ? pages : page + 1
        isFilter = true
        Course.findAll({
          where: { isActive: true }
        }).then(courses => {
          return res.render('students', { 
            students: result.rows,
            courses: courses,
            courseId: whereQuery.id,
            isFilter: isFilter,
            page: page,
            totalPage: totalPage,
            prev: prev,
            next: next,
            isAdmin: req.user.isAdmin
          })
        })
      })
    } else {
      Student.findAndCountAll({
        raw: true,
        nest: true,
        where: { status: 1 },
        limit: pageLimit,
        offset: offset
      }).then(result => {
        const page = Number(req.query.page) || 1
        const pages = Math.ceil(result.count / pageLimit)
        const totalPage = Array.from({ length: pages }).map((v, index) => index + 1)
        const prev = page - 1 < 1 ? 1 : page - 1
        const next = page + 1 > pages ? pages : page + 1
        Course.findAll({
          where: { isActive: true }
        }).then(courses => {
          return res.render('students', { 
            students: result.rows,
            courses: courses,
            isFilter: isFilter,
            page: page,
            totalPage: totalPage,
            prev: prev,
            next: next,
            isAdmin: req.user.isAdmin
          })
        })
      })
    }
  },

  getStudent: async (req, res) => {
    const result = await studentService.getStudentDetails(req.params.id)

    if (!result) {
     return res.redirect('/cramschool/students')
    }

    return res.render('student', result)
  },

  getStudentAttend: (req, res) => {
    Calendar.max('period', {
      where: {
        CourseId: req.params.courseId
      }
    }).then(currentPeriod => {
      if (isNaN(currentPeriod)) {
        console.log('Not found!')
        res.redirect('/cramschool/students')
      } else {
        Promise.all([
          Calendar.findAndCountAll({
            where: { CourseId: req.params.courseId, period: currentPeriod },
            include: { model: Attend, where: { StudentId: req.params.studentId }},
          }),
          Course.findOne({
            where: { id: req.params.courseId, isActive: true }
          }),
          Student.findOne({
            where: { id: req.params.studentId, status: 1 }
          })
        ]).then(([calendars, course, student]) => {
          if (course === null || student === null) {
            console.log('Not found!')
            res.redirect('/cramschool/students')
          } else {
            const data = calendars.rows.map(r => ({
              ...r.dataValues,
              ...r.dataValues.Attends['0'].dataValues
            }))
            return res.render('studentattend', { 
              student: student.toJSON(), 
              course: course.toJSON(), 
              attends: data,
              currentPeriod: currentPeriod,
              totalCalendarNums: course.amounts,
              finishCalendarNums: data.length,
              remainCalendarNums: course.amounts - data.length
            })
          }
        })
      }
    })
  }
}

module.exports = studentController