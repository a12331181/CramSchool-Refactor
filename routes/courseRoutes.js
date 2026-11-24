const { Router } = require('express')

const courseController = require('../controllers/courseController')

const { authenticated } = require('../middlewares/auth')

const router = Router()

router.get('/', authenticated, courseController.getCourseListPage)
router.get('/:courseId/calendar', authenticated, courseController.getCourseCalendarPage)
router.get('/:courseId/enrolledstudents', authenticated, courseController.getCourseStudentsPage)

module.exports = router
