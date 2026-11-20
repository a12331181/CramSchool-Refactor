const db = require('../models')
const Course = db.Course
const Teacher = db.Teacher
const Student = db.Student
const Diary = db.Diary
const User = db.User
const calendarService = require('../services/calendarService')
const meetingService = require('../services/meetingService')
const COURSE_SESSION_STATUS_LABELS = require('../constants/courseSessionStatusLabels')
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
  getSchoolIndexPage: async (req, res) => {
    const [meetings, diaries] = await Promise.all([
      meetingService.getRecentMeetings(5),
      Diary.findAll({ 
        raw: true,
        nest: true,
        limit: 4,
        include: [{ model: Course, where: {isActive: true }, include: [{ model: Teacher}] }],
        order: [['createdAt', 'DESC']]
      }),
    ])
    return res.render('school/home', { isAdmin: req.user.isAdmin, meetings, diaries })
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
      return res.render('courses/index', { courses: courses, isAdmin: req.user.isAdmin, user: user })
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

    const { course, sessions, currentPeriod, legacyCalendars } = result

    return res.render('courses/calendar', {
      course,
      sessions: sessions.map(session => ({
        startAtText: formatTaipeiDateTime(session.startAt) ?? '待核對',
        endAtText: formatTaipeiDateTime(session.endAt) ?? '待核對',
        statusText: COURSE_SESSION_STATUS_LABELS[session.status] ?? '待核對',
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
        return res.render('courses/students', {
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

    const meetings = await meetingService.getMeetingsPage({ offset, limit: pageLimit })

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
  
  getMeeting: async (req, res) => {
    const meeting = await meetingService.getMeetingDetails(req.params.id)
    if (!meeting) return res.redirect('/cramschool/meetings')

    return res.render('school/meetings/detail', { meeting })
  },

  getCreateMeetingPage: async (req, res) => {
    const teacher = await meetingService.getMeetingAuthor(req.user.id)
    return res.render('school/meetings/create', { teacher })
  },

  createMeeting: async (req, res) => {
    const { date, subject, content } = req.body ?? {}
    const created = await meetingService.createMeeting({ userId: req.user.id, date, subject, content })
    if (!created) {
      req.flash('error_messages', '找不到教師資料，無法建立會議紀錄')
      return res.redirect('/cramschool/meetings')
    }

    req.flash('success_messages', '已成功建立會議紀錄')
    return res.redirect('/cramschool')
  },

  deleteMeeting: async (req, res) => {
    const deleted = await meetingService.deleteMeeting(req.params.id)
    req.flash(
      deleted ? 'success_messages' : 'error_messages',
      deleted ? '已成功刪除會議記錄' : '找不到會議紀錄'
    )
    return res.redirect('/cramschool/meetings')
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