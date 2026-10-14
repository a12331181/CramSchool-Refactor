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

async function getStudentsPage({ page, courseId, pageSize }) {
  const offset = (page - 1) * pageSize

  const query = {
    raw: true,
    nest: true,
    where: { status: 1 },
    order: [['id', 'ASC']],
    limit: pageSize,
    offset
  }

  if (courseId !== undefined) {
    query.include = [{
      model: Course,
      as: 'EnrolledCourses',
      where: { id: courseId }
    }]
  }

  const result = await Student.findAndCountAll(query)

  const courses = await Course.findAll({
    where: { isActive: true },
    raw: true
  })

  return {
    rows: result.rows,
    count: result.count,
    courses
  }
}

module.exports = {
  getStudentDetails,
  getStudentsPage
}