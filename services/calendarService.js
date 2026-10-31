const { Course, Calendar } = require('../models')

async function getCalendarPage({ courseId, page, pageSize }) {
  const course = await Course.findByPk(courseId, {
    attributes: ['id', 'name', 'isActive']
  })

  if (!course) {
    return { ok: false, code: 'COURSE_NOT_FOUND' }
  }

  if (course.isActive === false) {
    return { ok: false, code: 'COURSE_CLOSED' }
  }

  const [result, latestPeriod] = await Promise.all([
    Calendar.findAndCountAll({
      where: { CourseId: courseId },
      order: [['id', 'ASC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      raw: true
    }),

    Calendar.max('period', {
      where: { CourseId: courseId }
    })
  ])

  return {
    ok: true,
    course: course.toJSON(),
    rows: result.rows,
    count: result.count,
    latestPeriod
  }
}

module.exports = {
  getCalendarPage
}