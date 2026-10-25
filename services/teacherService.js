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

async function getTeacherDetails(teacherId) {
  const teacher = await Teacher.findByPk(teacherId, {
    attributes: [
      'id',
      'name',
      'sex',
      'birth',
      'phone',
      'address',
      'education',
      'school',
      'image',
      'status',
      'UserId'
    ],
    include: [{
      model: User,
      attributes: ['email']
    }]
  })

  if (!teacher) {
    return null
  }

  return teacher.toJSON()
}

async function updateTeacher(teacherId, teacherData) {
  if (!Object.values(TEACHER_STATUS).includes(teacherData.status)) {
    return {
      updated: false,
      reason: 'INVALID_STATUS'
    }
  }

  const teacher = await Teacher.findByPk(teacherId)

  if (!teacher) {
    return {
      updated: false,
      reason: 'TEACHER_NOT_FOUND'
    }
  }

  const editableFields = [
    'name', 'sex', 'birth', 'phone',
    'address', 'education', 'school', 'status'
  ]

  const updates = {}

  for (const field of editableFields) {
    if (teacherData[field] !== undefined) {
      updates[field] = teacherData[field]
    }
  }

  await teacher.update(updates)

  return {
    updated: true
  }
}

module.exports = {
  getActiveTeachers,
  getTeachersPage,
  getTeacherDetails,
  updateTeacher
}