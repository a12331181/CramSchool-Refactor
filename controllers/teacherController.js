const teacherService = require('../services/teacherService')

const teacherController = {
  getTeachers: async (req, res) => {
    const teachers = await teacherService.getActiveTeachers()

    return res.render('teachers', {
      teachers,
      isAdmin: req.user.isAdmin
    })
  }
}

module.exports = teacherController