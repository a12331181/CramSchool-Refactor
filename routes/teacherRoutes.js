const { Router } = require('express')
const { authenticated } = require('../middlewares/auth')
const teacherController = require('../controllers/teacherController')

const router = Router()

router.get('/', authenticated, teacherController.getTeacherDirectoryPage)

module.exports = router
