const { Router } = require('express')
const { authenticated } = require('../middlewares/auth')
const studentController = require('../controllers/studentController')

const router = Router()

router.get('/', authenticated, studentController.getStudents)
router.get('/:id', authenticated, studentController.getStudent)
router.get('/:studentId/courses/:courseId/attend', authenticated, studentController.getStudentAttendanceHistory)

module.exports = router
