const db = require('../models')
const Course = db.Course
const Teacher = db.Teacher
const Student = db.Student
const User = db.User
const Calendar = db.Calendar
const Attend = db.Attend
const attendService = require('../services/attendService')

const attendController = {
  getAttendIndexpage: (req, res) => {
    User.findByPk(req.user.id,{
      raw: true,
      nest: true,
      include: [Teacher]
    }).then(user =>{
      Course.findAll({
        where: { isActive: true },
        include: {
          model: Teacher,
          where: { id: user.Teacher.id }
        }
      }).then(courses => {
        return res.render('courseattend', {
          courses: courses,
          isAdmin: req.user.isAdmin
        })
      })
    })
  },

  getAttendCourse: async (req, res) => {
    const courseId = Number(req.params.id)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await attendService.getAttendCourseData({
      courseId,
      userId: req.user.id
    })

    if (!result) {
      return res.redirect('/cramschool/attend')
    }

    return res.render('coursecalendar', result)
  },

  getAttend:(req, res) => {
    Promise.all([
      Calendar.findOne({
        where: { id: req.params.calendarId, isActive: true },
        include: [Attend]
      }),
      Course.findOne({
        where: { id: req.params.courseId, isActive: true },
        include: [{ model: Student, as: 'EnrolledStudents' }]
      })
    ]).then(([calendar, course]) => {
      let url = '/cramschool/attend/courses/'+ String(req.params.courseId)
      if (calendar === null || course === null) {
        console.log('Not found!')
        res.redirect(url)
      } else {
        const data = course.EnrolledStudents
        const students = data.map(r => ({
          ...r.dataValues,
          isChecked: calendar.Attends.map(d => d.StudentId).includes(r.id)
        }))
        return res.render('attend', { 
          calendar: calendar.toJSON(),
          students: students,
          course: course.toJSON() 
        })
      }
    })
  },

  postAttend: (req, res) => {
    const status = req.body.status
    let isAttend = ''
    let reason = ''
    let statusArray = status.split("/")
    if (status.includes('出席')) {
      isAttend = true
      reason = ''
    } else {
      isAttend = false
      reason = statusArray[1]
    }
    return Attend.create({
      CalendarId: req.params.calendarId,
      StudentId: req.params.studentId,
      isAttend: isAttend,
      reason: reason
    }).then((attend) => {
      req.flash('success_messages', '已成功新增出席紀錄')
      return res.redirect('back')
    })
  },

  deleteAttend: (req, res) => {
    return Attend.findOne({
      where: {
        CalendarId: req.params.calendarId,
        StudentId: req.params.studentId
      }
    }).then((attend) => {
      attend.destroy().then((attend) => {
        req.flash('success_messages', '已成功刪除出席紀錄')
        return res.redirect('back')
      })
    })
  }
}
module.exports = attendController