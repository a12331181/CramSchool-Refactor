const studentService = require('../services/studentService')
const { getPagination, getPaginationLinks } = require('../utils/pagination')
const db = require('../models')
const Student = db.Student
const Course = db.Course
const Calendar = db.Calendar
const Attend = db.Attend
const pageLimit = 12

const studentController = {
  getStudents: async (req, res) => {
    const requestedPage = Number(req.query.page || 1)

    const requestedCourseId = req.query.courseId
      ? Number(req.query.courseId)
      : undefined

    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
      return res.status(400).send('頁碼必須是正整數')
    }

    if (
      requestedCourseId !== undefined &&
      (!Number.isSafeInteger(requestedCourseId) || requestedCourseId < 1)
    ) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const queryOptions = {
      page: requestedPage,
      courseId: requestedCourseId,
      pageSize: pageLimit
    }

    const result = await studentService.getStudentsPage(queryOptions)

    const pagination = getPagination({
      page: queryOptions.page,
      pageSize: queryOptions.pageSize,
      totalCount: result.count
    })
    
    const pageUrl = targetPage => {
      const queryParams = new URLSearchParams({ page: String(targetPage) })
      if (queryOptions.courseId !== undefined) {
        queryParams.set('courseId', String(queryOptions.courseId))
      }
      return `/cramschool/students?${queryParams.toString()}`
    }

    if (queryOptions.page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('students/index', {
      students: result.rows,
      courses: result.courses,
      courseId: queryOptions.courseId ?? '',
      ...getPaginationLinks(pagination, pageUrl),
      isAdmin: req.user.isAdmin
    })
  },

  getStudent: async (req, res) => {
    const result = await studentService.getStudentDetails(req.params.id)

    if (!result) {
     return res.redirect('/cramschool/students')
    }

    return res.render('students/detail', result)
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
            return res.render('students/attendance', {
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