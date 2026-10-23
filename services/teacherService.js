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

module.exports = {
  getActiveTeachers
}