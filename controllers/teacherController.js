const teacherService = require('../services/teacherService')

const teacherController = {
  getTeacherDirectoryPage: async (req, res) => {
    const teachers = await teacherService.getActiveTeachers()

    return res.render('teachers/index', {
      teachers,
      isAdmin: req.user.isAdmin
    })
  }
}

module.exports = teacherController