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

async function removeEnrollment({ studentId, courseId }) {
  const deletedCount = await Enrollment.destroy({
    where: {
      StudentId: studentId,
      CourseId: courseId
    }
  })

  return {
    removed: deletedCount > 0
  }
}

module.exports = {
  addEnrollment,
  removeEnrollment
}