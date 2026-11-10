const db = require('../models')
const Tuition = db.Tuition
const Course = db.Course
const Student = db.Student
const FeeList = db.FeeList
const Calendar = db.Calendar
const ExtraFee = db.ExtraFee
const Payment = db.Payment
const moment = require('moment')
const calendarService = require('../services/calendarService')
const tuitionService = require('../services/tuitionService')
const { getTaipeiDate } = require('../utils/date')
const ATTEND_STATUS = require('../constants/attendStatus')
const NO_LEGACY_PERIOD_MESSAGE =
  '這門課程沒有原有期數，無法使用按期建立學費表。'

const tuitionController = {
  getCourseTuitionList: (req, res) => {
    Promise.all([
      Tuition.findAll({
        raw: true,
        nest: true,
        include: [Payment],
        where: { StudentId: req.params.studentId, CourseId: req.params.courseId },
      }),
      Course.findOne({
        where: { id: req.params.courseId, isActive: true }
      }),
      Student.findOne({
        where: { id: req.params.studentId, status: 1 }
      })
    ]).then(([tuitions, course, student]) => {
      if (course === null || student === null) {
        console.log('Not found!')
        res.redirect('/cramschool/payment')
      } else {
        let tuitionNotExist = false
        if (tuitions.length === 0) {
          tuitionNotExist = true
        }
        return res.render('tuition', {
          tuitions: tuitions,
          course: course.toJSON(),
          student: student.toJSON(),
          tuitionNotExist: tuitionNotExist
        })
      }
    })
  },
  
  getTuitionPreview: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)

    if (![courseId, studentId].every(id => Number.isSafeInteger(id) && id > 0)) {
      return res.status(400).send('課程與學生 ID 必須是正整數')
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const listUrl = `/cramschool/tuition/courses/${courseId}/students/${studentId}`
    const result = await tuitionService.getTuitionPreview({
      courseId,
      studentId,
      billingMonth
    })

    const errors = {
      INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
      UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法試算。',
      ENROLLMENT_NOT_FOUND: '找不到這位學生在本課程的選課紀錄。',
      NOT_ENROLLED_IN_BILLING_MONTH: '這位學生在本月沒有有效的選課期間。',
      ENROLLMENT_UNCONFIRMED: '選課期間有缺漏或重疊，請先核對。',
      CALENDAR_REQUIRES_REVIEW: '課堂時間資料需要先核對。',
      COURSE_NOT_FOUND: '找不到課程。',
      STUDENT_NOT_FOUND: '找不到學生。',
      INVALID_BILLING_TYPE: '請先核對課程的計費方式。',
      INVALID_PRICE: '請先核對課程價格。',
      INVALID_AMOUNT: '試算金額超出可處理範圍。'
    }
    
     const attendanceLabels = {
      [ATTEND_STATUS.PRESENT]: '出席',
      [ATTEND_STATUS.ABSENT]: '缺席',
      [ATTEND_STATUS.EXCUSED]: '請假',
      [ATTEND_STATUS.UNMARKED]: '未點名',
      not_due: '尚未到結束時間',
      requires_review: '待核對'
    }

    const attendanceItems = result.ok
      ? result.attendanceSummary.items.map(item => ({
          ...item,
          statusText: attendanceLabels[item.status] ?? '待核對'
        }))
      : []

    return res.render('tuitionpreview', {
      listUrl,
      previewUrl: `${listUrl}/preview`,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      preview: result.ok ? result : null,
      errorMessage: result.ok ? null : (errors[result.code] ?? '目前無法試算學費。'),
      calendarId: result.calendarId,
      enrollmentId: result.enrollmentId
    })
  },

  getStudentTuitionPreview: async (req, res) => {
    const studentId = Number(req.params.studentId)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return res.status(400).send('學生 ID 必須是正整數')
    }

    const billingMonth = req.query.billingMonth ?? getTaipeiDate().slice(0, 7)
    const result = await tuitionService.getStudentTuitionPreview({
      studentId,
      billingMonth
    })

    const messages = {
      INVALID_BILLING_MONTH: '請選擇有效的計費月份。',
      UTC_TIMEZONE_REQUIRED: '系統時間設定異常，暫時無法試算。',
      STUDENT_NOT_FOUND: '找不到學生。',
      NO_COURSES_IN_BILLING_MONTH: '這位學生在本月沒有有效選課的課程。',
      ENROLLMENT_COURSE_UNCONFIRMED: '這筆選課的課程資料需要核對。',
      ENROLLMENT_NOT_FOUND: '找不到選課紀錄，請先核對。',
      ENROLLMENT_UNCONFIRMED: '選課期間或狀態需要核對。',
      COURSE_NOT_FOUND: '找不到課程，請先核對。',
      INVALID_BILLING_TYPE: '課程的計費方式需要核對。',
      INVALID_PRICE: '課程價格需要核對。',
      INVALID_AMOUNT: '試算金額超出可處理範圍。',
      CALENDAR_REQUIRES_REVIEW: '課堂時間需要核對。',
      NO_BILLABLE_CALENDARS: '本月沒有符合條件的正式課堂。',
      CALENDAR_REVIEW_UNAVAILABLE: '尚未取得課堂核對資訊。',
      CALENDARS_REQUIRE_REVIEW: '有課堂日期或狀態需要核對。',
      ATTENDANCE_SUMMARY_UNAVAILABLE: '尚未取得點名摘要。',
      ATTENDANCE_REQUIRES_REVIEW: '有點名項目需要人工核對。'
    }

    const courses = result.ok ? result.courses : []
    const courseNames = new Map(
      courses.map(item => [item.course.id, item.course.name])
    )

    const courseRows = courses.map(item => ({
      ...item,
      detailUrl:
        `/cramschool/tuition/courses/${item.course.id}/students/${studentId}/preview` +
        `?billingMonth=${encodeURIComponent(result.billingMonth)}`
    }))

    const reviewRows = result.ok
      ? result.reviewItems.map(item => ({
          ...item,
          label: courseNames.get(item.courseId) ??
            (item.courseId ? `課程 #${item.courseId}` : '選課資料'),
          message: messages[item.code] ?? '這筆資料需要先核對。'
        }))
      : []

    return res.render('studenttuitionpreview', {
      previewUrl: `/cramschool/tuition/students/${studentId}/preview`,
      billingMonth: typeof billingMonth === 'string' ? billingMonth : '',
      preview: result.ok ? result : null,
      hasSubtotal: result.ok && Number.isSafeInteger(result.baseSubtotal),
      courseRows,
      reviewRows,
      errorMessage: result.ok ? null : (messages[result.code] ?? '目前無法試算。')
    })
  },

  createTuition: async (req, res) => {
    const courseId = Number(req.params.courseId)
    const studentId = Number(req.params.studentId)

    if (
      !Number.isSafeInteger(courseId) || courseId < 1 ||
      !Number.isSafeInteger(studentId) || studentId < 1
    ) {
      return res.status(400).send('課程與學生 ID 必須是正整數')
    }

    const [calendarPeriod, course] = await Promise.all([
      calendarService.getLatestLegacyPeriod(courseId),
      Course.findOne({
        where: { id: courseId, isActive: true },
        attributes: ['id', 'price'],
        raw: true
      })
    ])

    if (!course) {
      req.flash('error_messages', '找不到可建立學費表的課程')
      return res.redirect(303, '/cramschool/payment')
    }

    const url = `/cramschool/tuition/courses/${course.id}/students/${studentId}`

    if (calendarPeriod === null) {
      req.flash('error_messages', NO_LEGACY_PERIOD_MESSAGE)
      return res.redirect(303, url)
    }

    const currentPeriod = await Tuition.max('period', {
      where: { CourseId: course.id, StudentId: studentId }
    })

    if ((currentPeriod ?? 0) >= calendarPeriod) {
      req.flash('error_messages', '已有最新一期的學費表')
      return res.redirect(303, url)
    }

    await Tuition.create({
      amounts: course.price,
      CourseId: course.id,
      StudentId: studentId,
      period: calendarPeriod
    })

    req.flash('success_messages', '已成功建立收費表')
    return res.redirect(303, url)
  },

  createTuitions: async (req, res) => {
    const courseId = Number(req.params.id)

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const [calendarPeriod, course] = await Promise.all([
      calendarService.getLatestLegacyPeriod(courseId),
      Course.findOne({
        where: { id: courseId, isActive: true },
        attributes: ['id', 'price'],
        include: [{
          model: Student,
          as: 'EnrolledStudents',
          attributes: ['id'],
          where: { status: 1 },
          required: false,
          through: { attributes: [] }
        }]
      })
    ])

    if (!course) {
      req.flash('error_messages', '找不到可建立學費表的課程')
      return res.redirect(303, '/cramschool/payment')
    }

    const url = `/cramschool/payment/courses/${course.id}`

    if (calendarPeriod === null) {
      req.flash('error_messages', NO_LEGACY_PERIOD_MESSAGE)
      return res.redirect(303, url)
    }

    const students = course.EnrolledStudents

    if (students.length === 0) {
      req.flash('error_messages', '這門課程目前沒有可建立學費表的學生')
      return res.redirect(303, url)
    }

    let createdCount = 0

    for (const student of students) {
      const currentPeriod = await Tuition.max('period', {
        where: { CourseId: course.id, StudentId: student.id }
      })

      if ((currentPeriod ?? 0) < calendarPeriod) {
        await Tuition.create({
          amounts: course.price,
          CourseId: course.id,
          StudentId: student.id,
          period: calendarPeriod
        })

        createdCount += 1
      }
    }

    if (createdCount > 0) {
      req.flash('success_messages', `已成功建立 ${createdCount} 筆收費表`)
    } else {
      req.flash('error_messages', '學生皆已有最新一期的學費表')
    }

    return res.redirect(303, url)
  },

  editTuition: (req, res) => {
    Promise.all([
      ExtraFee.findAll({
        raw: true,
        nest: true
      }),
      Tuition.findOne({
        where: { id :req.params.id },
        include: [Course]
      }),
      Tuition.findByPk(req.params.id, {
        include: [{ model: ExtraFee, as: 'RequiredFee' }],
      }),
      Tuition.findByPk(req.params.id, {
        raw: true,
        nest: true,
        include: [Student]
      }),
    ]).then(([extrafees, tuition, tuitionFees, tuitionStudent]) => {
      if (tuition === null) {
        console.log('Not found!')
        res.redirect('/cramschool/payment')
      } else {
        const data = extrafees.map(r => ({
          ...r,
          isExisted: !tuitionFees.RequiredFee.map(d => d.id).includes(r.id)
        }))
        let total = tuition.Course.price
        let fees = tuitionFees.RequiredFee.map(r => r.dataValues)
        for (let i = 0; i < data.length; i++) {
          if (data[i].isExisted === false) {
            total += data[i].price
          }
        }
        Tuition.findByPk(req.params.id).then(editamounts => {
          editamounts.update({
            amounts: total
          })
        }).then(() => {
          return res.render('edittuition', { 
            extrafees: data,
            tuition: tuition.toJSON(),
            tuitionFees: fees,
            total: total,
            tuitionStudent: tuitionStudent
          })
        }) 
      }
    })
  },

  addFeeList: (req, res) => {
    FeeList.create({
      ExtraFeeId: req.params.extrafeeId,
      TuitionId: req.params.tuitionId
    }).then((feelist) => {
      req.flash('success_messages', '成功新增額外費用')
      return res.redirect('back')
    })
  },

  removeFeeList: (req, res) => {
    FeeList.destroy({
      where: {
        ExtraFeeId: req.params.extrafeeId,
        TuitionId: req.params.tuitionId
      }
    }).then(() => {
      req.flash('success_messages', '成功刪除額外費用')
      return res.redirect('back')
    })
  },

  confirmTuitionAndCreatePayment: (req, res) => {
    FeeList.findAll({
      where: { 
        TuitionId: req.params.id
      }
    }).then(feelists => {
      for (let i = 0; i < feelists.length; i++ ) {
        ExtraFee.findByPk(feelists[i].dataValues.ExtraFeeId, {
          raw: true,
          nest: true
        }).then(extrafee => {
          feelists[i].update({
            price: extrafee.price
          })
        })
      }
    }).then(() => {
      Tuition.findByPk(req.params.id, {include: [Course]}).then(tuition => {
        Promise.all([
          tuition.update({
            course_price: tuition.dataValues.Course.dataValues.price
          }),
          Payment.create({
            time: moment().format('YYYY-MM-DD'),
            amount: tuition.dataValues.amounts, 
            isPaid: false,
            TuitionId: tuition.id,
            currentPeriod: tuition.dataValues.period
          })
        ]).then(()=> {
          let url = '/cramschool/tuition/courses/'+ String(tuition.dataValues.CourseId) + '/students/' + String(tuition.dataValues.StudentId)
          req.flash('success_messages', '成功新增學費表與費用紀錄')
          return res.redirect(url)
        })
      })
    })
  },
  
  getTuition: (req, res) => {
    Promise.all([
      Tuition.findByPk(req.params.id, {
        include: [{ model: ExtraFee, as: 'RequiredFee'}]
      }),
      Tuition.findByPk(req.params.id, {
        raw: true,
        nest: true,
        include: [Course]
      }),
      Tuition.findByPk(req.params.id, {
        raw: true,
        nest: true,
        include: [Student]
      }),
      Tuition.findByPk(req.params.id, {
        raw: true,
        nest: true,
        include: [Payment]
      })
    ]).then(([tuition, tuitionCourse, tuitionStudent, tuitionPayment]) => {
      if (tuition === null) {
        return res.redirect('/cramschool/payment')
      } else if (tuitionPayment.Payment.id === null ) {
        return res.redirect('/cramschool/payment')
      } else {
        return res.render('tuitiondetail', {
          tuition: tuition,
          tuitionCourse: tuitionCourse,
          tuitionStudent: tuitionStudent
        })
      }
    })
  },

  deleteTuition: (req, res) => {
    Tuition.findByPk(req.params.id).then(tuition => {
      Promise.all([
        FeeList.destroy({ 
          where: { TuitionId: tuition.dataValues.id }
        }),
        tuition.destroy()
      ]).then(() => {
        req.flash('success_messages', '成功刪除費用表')
        return res.redirect('back')
      })
    })
  },
}

module.exports = tuitionController