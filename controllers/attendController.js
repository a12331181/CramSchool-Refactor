const db = require('../models')
const Course = db.Course
const Teacher = db.Teacher
const Student = db.Student
const Calendar = db.Calendar
const Attend = db.Attend
const attendService = require('../services/attendService')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const { formatTaipeiDateTime } = require('../utils/date')
const { UniqueConstraintError } = require('sequelize')

const attendController = {
  getAttendIndexpage: async (req, res) => {
    const { courses, sessions } = await attendService.getAttendIndexData({
      userId: req.user.id
    })

    const statusLabels = {
      [CALENDAR_STATUS.SCHEDULED]: '已排定',
      [CALENDAR_STATUS.COMPLETED]: '已完成',
      [CALENDAR_STATUS.CANCELLED]: '已取消'
    }

    return res.render('courseattend', {
      courses,
      sessions: sessions.map(session => ({
        id: session.id,
        courseId: session.CourseId,
        courseName: session.Course.name,
        startAtText: formatTaipeiDateTime(session.startAt) ?? '待核對',
        endAtText: formatTaipeiDateTime(session.endAt) ?? '待核對',
        statusText: statusLabels[session.status] ?? '待核對',
        content: session.content
      })),
      isAdmin: req.user.isAdmin
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
    }).catch(error => {
      if (
        !(error instanceof UniqueConstraintError) ||
        !Object.hasOwn(error.fields ?? {}, 'uq_attends_calendar_student')
      ) {
        throw error
      }

      req.flash('error_messages', '這位學生已有本堂點名紀錄。')
      return res.redirect('/cramschool/attend')
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