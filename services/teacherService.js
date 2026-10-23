const { Teacher, User } = require('../models')
const TEACHER_STATUS = require('../constants/teacherStatus')

async function getActiveTeachers() {
  const teachers = await Teacher.findAll({
    attributes: ['id', 'name', 'image', 'phone', 'UserId'],
    where: {
      status: TEACHER_STATUS.ACTIVE
    },
    include: [{
      model: User,
      attributes: ['email']
    }],
    order: [['id', 'ASC']]
  })

  return teachers.map(teacher => teacher.toJSON())
}

async function getTeachersPage({ page, pageSize, status }) {
  const where = {}

  if (status !== undefined) {
    where.status = status
  }

  return Teacher.findAndCountAll({
    attributes: [
      'id', 'name', 'sex', 'education', 'school', 'status'
    ],
    where,
    order: [
      ['status', 'ASC'],
      ['id', 'ASC']
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    raw: true
  })
}

module.exports = {
  getActiveTeachers,
  getTeachersPage
}