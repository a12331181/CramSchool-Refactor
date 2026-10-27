const { Course, Teacher } = require('../models')

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

module.exports = {
  getAdminCoursesPage
}