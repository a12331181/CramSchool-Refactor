const { Router } = require('express')

const teacherController = require('../controllers/teacherController')

const { authenticated } = require('../middlewares/auth')

const router = Router()

router.get('/', authenticated, teacherController.getTeacherDirectoryPage)

module.exports = router
