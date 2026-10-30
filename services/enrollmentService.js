const { Op } = require('sequelize')
const { Enrollment, Student, Course, sequelize } = require('../models')
const STUDENT_STATUS = require('../constants/studentStatus')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')
const { getTaipeiDate } = require('../utils/date')

async function addEnrollment({ studentId, courseId }) {
  return sequelize.transaction(async transaction => {
    // 選課異動統一先鎖學生，再鎖課程，最後讀寫選課紀錄。
    const student = await Student.findByPk(studentId, {
      attributes: ['id', 'status'],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!student || Number(student.status) !== STUDENT_STATUS.ACTIVE) {
      return {
        allowed: false,
        created: false,
        reason: 'STUDENT_UNAVAILABLE'
      }
    }

    const course = await Course.findByPk(courseId, {
      attributes: ['id', 'isActive'],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!course || !course.isActive) {
      return {
        allowed: false,
        created: false,
        reason: 'COURSE_UNAVAILABLE'
      }
    }

    const currentEnrollment = await Enrollment.findOne({
      where: {
        StudentId: studentId,
        CourseId: courseId,
        status: ENROLLMENT_STATUS.ACTIVE
      },
      transaction
    })

    if (currentEnrollment) {
      return { allowed: true, created: false }
    }

    const startsOn = getTaipeiDate()

    // 新期間為 [今天, 無限期)，舊期間必須已在今天或之前結束。
    const historyNeedsReview = await Enrollment.findOne({
      attributes: ['id'],
      where: {
        StudentId: studentId,
        CourseId: courseId,
        status: ENROLLMENT_STATUS.ENDED,
        [Op.or]: [
          { endsOn: null },
          { endsOn: { [Op.gt]: startsOn } }
        ]
      },
      transaction
    })

    if (historyNeedsReview) {
      return {
        allowed: false,
        created: false,
        reason: 'ENROLLMENT_HISTORY_REQUIRES_REVIEW'
      }
    }

    await Enrollment.create({
      StudentId: studentId,
      CourseId: courseId,
      startsOn,
      endsOn: null,
      status: ENROLLMENT_STATUS.ACTIVE
    }, { transaction })

    return { allowed: true, created: true }
  })
}

async function removeEnrollment({ studentId, courseId, enrollmentId }) {
  return sequelize.transaction(async transaction => {
    const student = await Student.findByPk(studentId, {
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!student) {
      return { removed: false, reason: 'STUDENT_UNAVAILABLE' }
    }

    // 關閉的課程仍可退選，因此這裡不限制 isActive。
    const course = await Course.findByPk(courseId, {
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!course) {
      return { removed: false, reason: 'COURSE_UNAVAILABLE' }
    }

    const enrollment = await Enrollment.findOne({
      where: {
        id: enrollmentId,
        StudentId: studentId,
        CourseId: courseId
      },
      transaction
    })

    if (!enrollment || enrollment.status !== ENROLLMENT_STATUS.ACTIVE) {
      return { removed: false, reason: 'ENROLLMENT_NOT_ACTIVE' }
    }

    const endsOn = getTaipeiDate()

    if (enrollment.startsOn && enrollment.startsOn > endsOn) {
      return { removed: false, reason: 'INVALID_END_DATE' }
    }

    await enrollment.update({
      endsOn,
      status: ENROLLMENT_STATUS.ENDED
    }, { transaction })

    return { removed: true }
  })
}

async function getEnrollmentPage(studentId) {
  const student = await Student.findByPk(studentId, {
    attributes: ['id', 'name', 'status'],
    include: [{
      model: Course,
      as: 'EnrolledCourses',
      attributes: ['id'],
      through: {
        attributes: ['id'],
        where: { status: ENROLLMENT_STATUS.ACTIVE }
      }
    }]
  })

  if (!student || Number(student.status) !== STUDENT_STATUS.ACTIVE) {
    return null
  }

  const enrollmentIds = new Map(
    student.EnrolledCourses.map(course => [course.id, course.Enrollment.id])
  )

  const courses = await Course.findAll({
    where: {
      [Op.or]: [
        { isActive: true },
        { id: { [Op.in]: [...enrollmentIds.keys()] } }
      ]
    },
    attributes: ['id', 'name', 'isActive'],
    order: [['id', 'ASC']],
    raw: true
  })

  return {
    student: student.toJSON(),
    courses: courses.map(course => ({
      ...course,
      isEnrolled: enrollmentIds.has(course.id),
      enrollmentId: enrollmentIds.get(course.id) ?? null
    }))
  }
}

module.exports = {
  addEnrollment,
  removeEnrollment,
  getEnrollmentPage
}