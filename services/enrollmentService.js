const { Enrollment, Student, Course } = require('../models')
const STUDENT_STATUS = require('../constants/studentStatus')

async function addEnrollment({ studentId, courseId }) {
  const [, created] = await Enrollment.findOrCreate({
    where: {
      StudentId: studentId,
      CourseId: courseId
    }
  })

  return {
    created
  }
}

async function removeEnrollment({ studentId, courseId }) {
  const deletedCount = await Enrollment.destroy({
    where: {
      StudentId: studentId,
      CourseId: courseId
    }
  })

  return {
    removed: deletedCount > 0
  }
}

async function getEnrollmentPage(studentId) {
  const student = await Student.findByPk(studentId, {
    include: [{
      model: Course,
      as: 'EnrolledCourses',
      attributes: ['id'],
      through: { attributes: [] }
    }]
  })

  if (!student) {
    return null
  }

  if (Number(student.status) !== STUDENT_STATUS.ACTIVE) {
    return null
  }

  const courses = await Course.findAll({
    where: { isActive: true },
    attributes: ['id', 'name'],
    order: [['id', 'ASC']],
    raw: true
  })

  const enrolledCourseIds = new Set(
    student.EnrolledCourses.map(course => course.id)
  )

  return {
    student: student.toJSON(),
    courses: courses.map(course => ({
      ...course,
      isEnrolled: enrolledCourseIds.has(course.id)
    }))
  }
}

module.exports = {
  addEnrollment,
  removeEnrollment,
  getEnrollmentPage
}