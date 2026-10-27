const { Course, Teacher, Calendar, sequelize } = require('../models')
const {COURSE_TIMES, COURSE_TYPES} = require('../constants/courseOptions')
const moment = require('moment')

async function getAdminCoursesPage({ page, pageSize }) {
  const result = await Course.findAndCountAll({
    attributes: [
      'id',
      'name',
      'time',
      'type',
      'amounts',
      'price',
      'TeacherId',
      'isActive'
    ],
    include: [{
      model: Teacher,
      attributes: ['id', 'name'],
      required: false
    }],
    order: [
      ['isActive', 'DESC'],
      ['id', 'ASC']
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize
  })

  return {
    rows: result.rows.map(course => course.toJSON()),
    count: result.count
  }
}

async function getCourseFormData() {
  const teachers = await Teacher.findAll({
    attributes: ['id', 'name'],
    order: [['id', 'ASC']],
    raw: true
  })

  return {
    teachers
  }
}

async function createCourse(courseData) {
  const {
    name,
    time,
    type,
    amounts,
    price,
    teacherId
  } = courseData

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 255
  ) {
    return { created: false, reason: 'INVALID_NAME' }
  }

  if (!Object.values(COURSE_TIMES).includes(time)) {
    return { created: false, reason: 'INVALID_TIME' }
  }

  if (!Object.values(COURSE_TYPES).includes(type)) {
    return { created: false, reason: 'INVALID_TYPE' }
  }

  if (!Number.isSafeInteger(amounts) || amounts < 1 || amounts > 36) {
    return { created: false, reason: 'INVALID_AMOUNTS' }
  }

  if (
    !Number.isSafeInteger(price) ||
    price < 0 ||
    price > 2147483647
  ) {
    return { created: false, reason: 'INVALID_PRICE' }
  }

  if (!Number.isSafeInteger(teacherId) || teacherId < 1) {
    return { created: false, reason: 'INVALID_TEACHER_ID' }
  }

  return sequelize.transaction(async transaction => {
    const teacher = await Teacher.findByPk(teacherId, {
      attributes: ['id'],
      transaction
    })

    if (!teacher) {
      return { created: false, reason: 'TEACHER_NOT_FOUND' }
    }

    const course = await Course.create({
      name: name.trim(),
      time,
      type,
      amounts,
      price,
      TeacherId: teacherId,
      isActive: true
    }, { transaction })

    const defaultDate = moment().format('YYYY-MM-DD')

    const calendars = Array.from({ length: amounts }, (_, index) => ({
      date: defaultDate,
      content: String(index),
      CourseId: course.id,
      period: 1,
      isActive: true
    }))

    await Calendar.bulkCreate(calendars, {
      transaction
    })

    return { created: true }
  })
}

module.exports = {
  getAdminCoursesPage,
  getCourseFormData,
  createCourse
}