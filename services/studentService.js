const { Student, Course } = require('../models')

async function getStudentDetails(studentId) {
  const student = await Student.findOne({
    include: [{ model: Course, as: 'EnrolledCourses' }],
    where: {
      id: studentId,
      status: 1
    }
  })

  if (!student) {
    return null
  }

  const data = student.toJSON()

  return {
    student: data,
    enrolledCourses: data.EnrolledCourses
  }
}

module.exports = {
  getStudentDetails
}