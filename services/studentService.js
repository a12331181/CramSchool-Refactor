const { Student, Course } = require('../models')
const STUDENT_STATUS = require('../constants/studentStatus')

async function getStudentDetails(studentId) {
  const student = await Student.findOne({
    include: [{ model: Course, as: 'EnrolledCourses' }],
    where: {
      id: studentId,
      status: STUDENT_STATUS.ACTIVE
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
    distinct: true,
    where: { status: STUDENT_STATUS.ACTIVE },
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

async function getAdminStudentsPage({ page, pageSize, courseId }) {
  const query = {
    attributes: ['id', 'name', 'sex', 'school', 'grade', 'status'],
    order: [
      ['status', 'ASC'],
      ['id', 'ASC']
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  }

  if (courseId !== undefined) {
    query.include = [{
      model: Course,
      as: 'EnrolledCourses',
      attributes: [],
      through: { attributes: [] },
      where: { id: courseId },
      required: true
    }]
  }

  const result = await Student.findAndCountAll(query)

  const courses = await Course.findAll({
    attributes: ['id', 'name'],
    order: [['id', 'ASC']],
    raw: true
  })

  return {
    rows: result.rows.map(student => student.toJSON()),
    count: result.count,
    courses
  }
}

module.exports = {
  getStudentDetails,
  getStudentsPage,
  getAdminStudentsPage
}