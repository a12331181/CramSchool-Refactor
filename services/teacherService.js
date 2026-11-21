const { Teacher, User } = require('../models')
const TEACHER_STATUS = require('../constants/teacherStatus')

function getTeacherAccountInclude() {
  return { model: User, attributes: ['userNo'], required: false }
}

async function getActiveTeachersPage({ limit, offset }) {
  const { rows, count } = await Teacher.findAndCountAll({
    attributes: ['name', 'phone', 'UserId'],
    where: {
      status: TEACHER_STATUS.ACTIVE
    },
    include: [{
      model: User,
      attributes: ['email', 'userNo']
    }],
    order: [['id', 'ASC']],
    limit,
    offset
  })

  return { teachers: rows.map(teacher => teacher.toJSON()), count }
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
    include: [getTeacherAccountInclude()],
    order: [
      ['status', 'ASC'],
      ['id', 'ASC']
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    raw: true,
    nest: true
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
      attributes: ['email', 'userNo']
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
  getTeacherAccountInclude,
  getActiveTeachersPage,
  getTeachersPage,
  getTeacherDetails,
  updateTeacher
}
