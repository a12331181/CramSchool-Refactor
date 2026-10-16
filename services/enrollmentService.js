const { Enrollment } = require('../models')

async function addEnrollment({ studentId, courseId }) {
  const [, created] = await Enrollment.findOrCreate({
    where: {
      StudentId: studentId,
      CourseId: courseId
    }
  })

  return {
    created
  }
}

module.exports = {
  addEnrollment
}