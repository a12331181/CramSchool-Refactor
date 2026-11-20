const { Router } = require('express')
const { authenticated } = require('../middlewares/auth')
const schoolController = require('../controllers/schoolController')

const router = Router()

router.get('/', authenticated, schoolController.getCourses)
router.get('/:id/calendar', authenticated, schoolController.getCourse)
router.get('/:id/enrolledstudents', authenticated, schoolController.getCourseEnrolledStudents)

module.exports = router
