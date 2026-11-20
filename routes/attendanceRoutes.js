const { Router } = require('express')
const { authenticated } = require('../middlewares/auth')
const attendController = require('../controllers/attendController')

const router = Router()

router.get('/', authenticated, attendController.getAttendanceHome)
router.get('/courses/:courseId/sessions', authenticated, attendController.getCourseAttendanceSessions)
router.get('/courses/:courseId/calendar/:calendarId/students', authenticated, attendController.getAttendStudents)
router.post('/courses/:courseId/calendar/:calendarId/students/:studentId', authenticated, attendController.createAttend)
router.put('/courses/:courseId/calendar/:calendarId/students/:studentId', authenticated, attendController.updateAttend)
router.get('/courses/:courseId/calendar/:calendarId/students/:studentId/history', authenticated, attendController.getAttendHistory)

module.exports = router
