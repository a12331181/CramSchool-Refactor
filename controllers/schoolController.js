const db = require('../models')
const Course = db.Course
const Teacher = db.Teacher
const Meeting = db.Meeting
const Student = db.Student
const Diary = db.Diary
const User = db.User
const calendarService = require('../services/calendarService')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const { formatTaipeiDateTime } = require('../utils/date')
const { getPagination, getPaginationLinks } = require('../utils/pagination')
const pageLimit = 10

function parseListPage(value) {
  const page = Number(value || 1)
  if (!Number.isSafeInteger(page) || page < 1) return null

  const offset = (page - 1) * pageLimit
  return Number.isSafeInteger(offset) ? { page, offset } : null
}

const schoolController = {
  getSchoolIndexPage: (req, res) => {
    Promise.all([
      Meeting.findAll({ 
        raw: true,
        nest: true,
        limit: 5,
        order: [['createdAt', 'DESC']]
      }),
      Diary.findAll({ 
        raw: true,
        nest: true,
        limit: 4,
        include: [{ model: Course, where: {isActive: true }, include: [{ model: Teacher}] }],
        order: [['createdAt', 'DESC']]
      }),
    ]).then(([meetings, diaries]) => {
      return res.render('school/home', { isAdmin: req.user.isAdmin, meetings: meetings, diaries: diaries})
    })
  },
  
  getIntroduction: (req, res) => {
    return res.render('school/introduction')
  },

  getCourses: (req, res) => {
    Promise.all([
      Course.findAll({ 
        raw: true,
        nest: true, 
        include: [ 
          { model: Teacher }
        ],
        where: { isActive : true }
      }),
      User.findByPk(req.user.id, {
        raw: true,
        nest: true,
        include: [Teacher]
      })
    ]).then(([courses, user]) => {
      return res.render('courses', { courses: courses, isAdmin: req.user.isAdmin, user: user })
    })
  },

  getCourse: async (req, res) => {
    const courseId = Number(req.params.id)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await calendarService.getCourseCalendarData(courseId)

    if (!result) {
      return res.redirect('/cramschool/courses')
    }

    const statusLabels = {
      [CALENDAR_STATUS.SCHEDULED]: '已排定',
      [CALENDAR_STATUS.COMPLETED]: '已完成',
      [CALENDAR_STATUS.CANCELLED]: '已取消'
    }

    const { course, sessions, currentPeriod, legacyCalendars } = result

    return res.render('course', {
      course,
      sessions: sessions.map(session => ({
        startAtText: formatTaipeiDateTime(session.startAt) ?? '待核對',
        endAtText: formatTaipeiDateTime(session.endAt) ?? '待核對',
        statusText: statusLabels[session.status] ?? '待核對',
        content: session.content
      })),
      calendars: legacyCalendars,
      currentPeriod,
      firstCalendarDate: legacyCalendars[0]?.date,
      lastCalendarDate: legacyCalendars.at(-1)?.date
    })
  },
  
  getCourseEnrolledStudents: (req, res) => {
    Course.findOne({
      where: { id: req.params.id, isActive: true },
      include: [{ model: Student, as: 'EnrolledStudents', where: { status: 1 }}]
    }).then(course => {
      if (course === null) {
        console.log('Not found!')
        res.redirect('/cramschool/courses')
      } else {
        const students = course.EnrolledStudents.map(r => ({
          ...r.dataValues
        }))
        return res.render('enrolledstudents', { 
          course: course.toJSON(), 
          students: students 
        })
      }
    })
  },

  getMeetings: async (req, res) => {
    const listPage = parseListPage(req.query.page)
    if (!listPage) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const meetings = await Meeting.findAndCountAll({
      raw: true,
      nest: true,
      offset,
      limit: pageLimit,
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    })

    const pagination = getPagination({ page, pageSize: pageLimit, totalCount: meetings.count })
    const pageUrl = targetPage => `/cramschool/meetings?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/meetings/index', {
      meetings: meetings.rows,
      isAdmin: req.user.isAdmin,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },
  
  getMeeting: (req, res) => {
    Meeting.findByPk(req.params.id, {
      raw: true,
      nest: true,
      include: [Teacher]
    }).then(meeting => {
      if (meeting === null) {
        console.log('Not found!')
        res.redirect('/cramschool/meetings')
      } else {
        return res.render('school/meetings/detail',{ meeting: meeting })
      }
    })
  },

  getCreateMeetingPage: (req, res) => {
    Teacher.findOne({
      raw: true,
      nest: true,
      where: {
        UserId: req.user.id
      }
    }).then(teacher => {
      return res.render('school/meetings/create',{ teacher: teacher })
    })
  },

  createMeeting: (req, res) => {
    Teacher.findOne({
      raw: true,
      nest: true,
      where: {
        UserId: req.user.id
      }
    }).then(teacher => {
      return Meeting.create({
        date: req.body.date,
        subject: req.body.subject,
        content: req.body.content,
        TeacherId: teacher.id,
      })
    }).then((meeting) => {
      req.flash('success_messages', '已成功建立會議紀錄')
      return res.redirect('/cramschool')
    })
  },

  deleteMeeting: (req, res) => {
    return Meeting.findByPk(req.params.id)
      .then((meeting) => {
        meeting.destroy()
          .then((meeting) => {
            req.flash('success_messages', '已成功刪除會議記錄')
            res.redirect('/cramschool/meetings')
          })
      })
  },
  
  getDiariesList: async (req, res) => {
    const listPage = parseListPage(req.query.page)
    if (!listPage) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const diaries = await Diary.findAndCountAll({
      raw: true,
      nest: true,
      include: [{ model: Course, where: { isActive: true }, include: [{ model: Teacher }] }],
      offset,
      limit: pageLimit,
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    })

    const pagination = getPagination({ page, pageSize: pageLimit, totalCount: diaries.count })
    const pageUrl = targetPage => `/cramschool/diaries?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/diaries/index', {
      diaries: diaries.rows,
      isAdmin: req.user.isAdmin,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  deleteDiaryInList: (req, res) => {
    return Diary.findByPk(req.params.id)
      .then((diary) => {
        diary.destroy()
          .then((diary) => {
            req.flash('success_messages', '已成功刪除教師日誌')
            res.redirect('/cramschool/diaries')
          })
      })
  },

  getDiaries: async (req, res) => {
    const courseId = Number(req.params.id)
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const listPage = parseListPage(req.query.page)
    if (!listPage) {
      return res.status(400).send('頁碼不正確或超出可處理範圍')
    }
    const { page, offset } = listPage

    const [diaries, course] = await Promise.all([
      Diary.findAndCountAll({
        raw: true,
        nest: true,
        where: { CourseId: courseId },
        include: { model: Course, include: { model: Teacher } },
        offset,
        limit: pageLimit,
        order: [['createdAt', 'DESC'], ['id', 'DESC']]
      }),
      Course.findOne({
        raw: true,
        nest: true,
        where: { id: courseId, isActive: true }
      })
    ])

    if (!course) return res.redirect('/cramschool/courses')

    const pagination = getPagination({ page, pageSize: pageLimit, totalCount: diaries.count })
    const pageUrl = targetPage => `/cramschool/courses/${courseId}/diaries?page=${targetPage}`

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('school/diaries/course-list', {
      diaries: diaries.rows,
      course,
      isDiaryNotExist: diaries.count === 0,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getDiary: (req, res) => {
    Diary.findOne({
      raw: true,
      nest: true,
      where: {
        id: req.params.diaryId
      },
      include: [Teacher]
    }).then(diary => {
      if (diary === null) {
        console.log('Not found!')
        return res.redirect('/cramschool/courses')
      } else {
        return res.render('school/diaries/detail', { diary: diary })
      }
    })
  },

  getCreateDiaryPage: (req, res) => {
    Promise.all([
      Course.findOne({
        raw: true,
        nest: true,
        include: [Teacher],
        where: { id: req.params.id, isActive: true },
      }),
      User.findByPk(req.user.id, {
        raw: true,
        nest: true,
        include: [Teacher]
      })
    ]).then(([course, user]) => {
      if (course === null || user.Teacher.id === null) {
        console.log('Not found!')
        return res.redirect('/cramschool/courses')
      } else {
        res.render('school/diaries/create', { course: course, user: user })
      }
    })
  },

  createDiary: (req, res) => {
    Teacher.findOne({
      raw: true,
      nest: true,
      where: {
        UserId: req.user.id
      }
    }).then(teacher => {
      return Diary.create({
        date: req.body.date,
        subject: req.body.subject,
        content: req.body.content,
        TeacherId: teacher.id,
        CourseId: req.params.id,
      })
    }).then((diary) => {
      let url = '/cramschool/courses/'+ String(req.params.id) + '/diaries'
      req.flash('success_messages', '已成功建立教師日誌')
      return res.redirect(url)
    })
  },

  deleteDiary: (req, res) => {
    return Diary.findByPk(req.params.diaryId)
      .then((diary) => {
        diary.destroy()
          .then((diary) => {
            let url = '/cramschool/courses/'+ String(req.params.courseId) + '/diaries'
            req.flash('success_messages', '已成功刪除教師日誌')
            res.redirect(url)
          })
      })
  },
}
module.exports = schoolController