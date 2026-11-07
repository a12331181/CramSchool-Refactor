const { Course, Teacher, Calendar, Enrollment, Student } = require('../models')
const { Op } = require('sequelize')
const CALENDAR_STATUS = require('../constants/calendarStatus')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')
const { getTaipeiDate } = require('../utils/date')

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

async function getAttendStudentsData({ courseId, calendarId, userId }) {
  const calendar = await Calendar.findOne({
    attributes: ['id', 'CourseId', 'startAt', 'endAt', 'status', 'content'],
    where: {
      id: calendarId,
      CourseId: courseId,
      status: {
        [Op.in]: [
          CALENDAR_STATUS.SCHEDULED,
          CALENDAR_STATUS.COMPLETED
        ]
      }
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
        attributes: ['id', 'name'],
        required: true
      }
    ],
    raw: true,
    nest: true
  })

  if (
    !calendar ||
    !(calendar.startAt instanceof Date) ||
    !Number.isFinite(calendar.startAt.getTime()) ||
    !(calendar.endAt instanceof Date) ||
    !Number.isFinite(calendar.endAt.getTime()) ||
    calendar.startAt >= calendar.endAt
  ) {
    return null
  }

  const calendarDate = getTaipeiDate(calendar.startAt)

  const enrollments = await Enrollment.findAll({
    attributes: ['StudentId', 'startsOn', 'endsOn', 'status'],
    where: {
      CourseId: courseId,
      status: {
        [Op.in]: [
          ENROLLMENT_STATUS.ACTIVE,
          ENROLLMENT_STATUS.ENDED
        ]
      },
      [Op.and]: [
        {
          [Op.or]: [
            { startsOn: null },
            { startsOn: { [Op.lte]: calendarDate } }
          ]
        },
        {
          [Op.or]: [
            { endsOn: null },
            { endsOn: { [Op.gt]: calendarDate } }
          ]
        }
      ]
    },
    raw: true
  })

  const studentIds = new Set()
  const pendingIds = new Set()

  for (const enrollment of enrollments) {
    const unknownDates =
      enrollment.startsOn == null ||
      (
        enrollment.status === ENROLLMENT_STATUS.ENDED &&
        enrollment.endsOn == null
      )

    if (unknownDates) {
      pendingIds.add(enrollment.StudentId)
    } else {
      studentIds.add(enrollment.StudentId)
    }
  }

  for (const id of studentIds) {
    pendingIds.delete(id)
  }

  const students = studentIds.size === 0
    ? []
    : await Student.findAll({
        attributes: ['id', 'name'],
        where: {
          id: { [Op.in]: [...studentIds] }
        },
        order: [['id', 'ASC']],
        raw: true
      })

  return {
    calendar,
    course: calendar.Course,
    calendarDate,
    students,
    pendingCount: pendingIds.size
  }
}

module.exports = { 
  getAttendCourseData,
  getAttendIndexData,
  getAttendStudentsData
}