const { Course, Teacher, Calendar } = require('../models')
const { Op } = require('sequelize')
const CALENDAR_STATUS = require('../constants/calendarStatus')

async function getAttendCourseData({ courseId, userId }) {
  const course = await Course.findOne({
    attributes: ['id', 'name'],
    where: { id: courseId, isActive: true },
    include: [{
      model: Teacher,
      attributes: [],
      where: { UserId: userId },
      required: true
    }],
    raw: true
  })

  if (!course) return null

  const legacyWhere = {
    CourseId: courseId,
    status: null,
    startAt: null,
    endAt: null,
    TeacherId: null
  }

  const maxPeriod = await Calendar.max('period', { where: legacyWhere })

  const calendars = maxPeriod == null
    ? []
    : await Calendar.findAll({
        attributes: ['id', 'date', 'content', 'isActive'],
        where: { ...legacyWhere, period: maxPeriod },
        order: [['isActive', 'DESC'], ['id', 'ASC']],
        raw: true
      })

  return { course, calendars, maxPeriod }
}

async function getAttendIndexData({ userId }) {
  const [courses, calendars] = await Promise.all([
    Course.findAll({
      attributes: ['id', 'name'],
      where: { isActive: true },
      include: [{
        model: Teacher,
        attributes: ['name'],
        where: { UserId: userId },
        required: true
      }],
      order: [['id', 'ASC']]
    }),

    Calendar.findAll({
      attributes: ['id', 'CourseId', 'startAt', 'endAt', 'status', 'content'],
      where: {
        status: {
          [Op.in]: [
            CALENDAR_STATUS.SCHEDULED,
            CALENDAR_STATUS.COMPLETED,
            CALENDAR_STATUS.CANCELLED
          ]
        },
        startAt: { [Op.ne]: null },
        endAt: { [Op.ne]: null }
      },
      include: [
        {
          model: Teacher,
          attributes: [],
          where: { UserId: userId },
          required: true
        },
        {
          model: Course,
          attributes: ['name'],
          where: { isActive: true },
          required: true
        }
      ],
      order: [['startAt', 'ASC'], ['id', 'ASC']],
      raw: true,
      nest: true
    })
  ])

  return { courses, calendars }
}

module.exports = { 
  getAttendCourseData,
  getAttendIndexData
}