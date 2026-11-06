const { Course, Teacher, Calendar } = require('../models')

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

module.exports = { 
  getAttendCourseData 
}