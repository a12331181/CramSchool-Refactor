const db = require('../models')
const Course = db.Course
const Student = db.Student
const Calendar = db.Calendar
const Attend = db.Attend
const attendService = require('../services/attendService')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const ATTEND_STATUS = require('../constants/attendStatus')
const { formatTaipeiDateTime } = require('../utils/date')
const { UniqueConstraintError } = require('sequelize')

const attendController = {
  getAttendIndexpage: async (req, res) => {
    const { courses, calendars } = await attendService.getAttendIndexData({
      userId: req.user.id
    })

    const statusLabels = {
      [CALENDAR_STATUS.SCHEDULED]: '已排定',
      [CALENDAR_STATUS.COMPLETED]: '已完成',
      [CALENDAR_STATUS.CANCELLED]: '已取消'
    }

    return res.render('courseattend', {
      courses,
      calendars: calendars.map(calendar => ({
        id: calendar.id,
        courseId: calendar.CourseId,
        courseName: calendar.Course.name,
        canViewStudents:
          calendar.status === CALENDAR_STATUS.SCHEDULED ||
          calendar.status === CALENDAR_STATUS.COMPLETED,
        startAtText: formatTaipeiDateTime(calendar.startAt) ?? '待核對',
        endAtText: formatTaipeiDateTime(calendar.endAt) ?? '待核對',
        statusText: statusLabels[calendar.status] ?? '待核對',
        content: calendar.content
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

  getAttendStudents: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)

    if (
      !Number.isSafeInteger(courseId) || courseId < 1 ||
      !Number.isSafeInteger(calendarId) || calendarId < 1
    ) {
      return res.status(400).send('課程與課堂 ID 必須是正整數')
    }

    const result = await attendService.getAttendStudentsData({
      courseId,
      calendarId,
      userId: req.user.id
    })

    if (!result) {
      req.flash('error_messages', '找不到可查看的課堂')
      return res.redirect('/cramschool/attend')
    }

    const canCreate =
      result.calendar.status === CALENDAR_STATUS.SCHEDULED &&
      Number(result.course.isActive) === 1

    const labels = {
      [ATTEND_STATUS.PRESENT]: '出席',
      [ATTEND_STATUS.ABSENT]: '缺席',
      [ATTEND_STATUS.EXCUSED]: '請假',
      [ATTEND_STATUS.UNMARKED]: '未點名'
    }

    return res.render('attend', {
      ...result,
      isFormalCalendar: true,
      startAtText: formatTaipeiDateTime(result.calendar.startAt),
      endAtText: formatTaipeiDateTime(result.calendar.endAt),
      calendarStartAt: result.calendar.startAt.toISOString(),
      calendarEndAt: result.calendar.endAt.toISOString(),
      students: result.students.map(student => ({
        ...student,
        attendText: student.hasAttend
          ? labels[student.attendStatus] ?? '舊紀錄待核對'
          : '未點名',
        canCreateAttend: canCreate && !student.hasAttend
      }))
    })
  },

  createAttend: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const calendarId = Number(req.params.calendarId)
    const studentId = Number(req.params.studentId)
    const { calendarStartAt, calendarEndAt, status, reason } = req.body ?? {}

    if (
      ![courseId, calendarId, studentId].every(id => Number.isSafeInteger(id) && id > 0) ||
      typeof calendarStartAt !== 'string' || typeof calendarEndAt !== 'string'
    ) {
      return res.status(400).send('課程、課堂、學生或時間格式不正確')
    }

    const result = await attendService.createAttend({
      courseId,
      calendarId,
      studentId,
      calendarStartAt,
      calendarEndAt,
      status,
      reason,
      userId: req.user.id
    })

    const errors = {
      INVALID_INPUT: '資料格式不正確。',
      CALENDAR_UNAVAILABLE: '找不到可登記的課堂。',
      CALENDAR_CHANGED: '上課時間已變更，請核對後再登記。',
      ENROLLMENT_UNCONFIRMED: '學生當天的選課期間無法確認，請先核對。',
      INVALID_STATUS: '請選擇出席、缺席或請假。',
      INVALID_REASON: '原因／備註必須是 255 字以內的文字。',
      REASON_REQUIRED: '請填寫請假原因。'
    }

    req.flash(
      result.ok ? 'success_messages' : 'error_messages',
      result.ok
        ? (result.created ? '已登記出席。' : '已有點名紀錄，本次未修改。')
        : errors[result.code] ?? '目前無法登記。'
    )

    return res.redirect(
      303,
      `/cramschool/attend/courses/${courseId}/calendar/${calendarId}/students`
    )
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

  postAttend: async (req, res) => {
    const legacyCalendar = await Calendar.findOne({
      attributes: ['id'],
      where: {
        id: req.params.calendarId,
        status: null,
        startAt: null,
        endAt: null,
        TeacherId: null
      }
    })

    if (!legacyCalendar) {
      req.flash('error_messages', '正式課堂請由學生名單登記點名。')
      return res.redirect('/cramschool/attend')
    }

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
        StudentId: req.params.studentId,
        status: null
      }
    }).then((attend) => {
      if (!attend) {
        req.flash('error_messages', '查無可刪除的舊點名紀錄。')
        return res.redirect('/cramschool/attend')
      }
      attend.destroy().then((attend) => {
        req.flash('success_messages', '已成功刪除出席紀錄')
        return res.redirect('back')
      })
    })
  },
}
module.exports = attendController