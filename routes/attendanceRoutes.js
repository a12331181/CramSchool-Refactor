const { Router } = require('express')
const { authenticated } = require('../middlewares/auth')
const attendanceController = require('../controllers/attendanceController')

const router = Router()

router.get('/', authenticated, attendanceController.getAttendanceHomePage)
router.get(
  '/courses/:courseId/sessions',
  authenticated,
  attendanceController.getCourseAttendanceSessionsPage
)
router.get(
  '/courses/:courseId/calendar/:calendarId/students',
  authenticated,
  attendanceController.getAttendanceRosterPage
)
router.post(
  '/courses/:courseId/calendar/:calendarId/students/:studentId',
  authenticated,
  attendanceController.recordAttendance
)
router.put(
  '/courses/:courseId/calendar/:calendarId/students/:studentId',
  authenticated,
  attendanceController.updateAttendance
)
router.get(
  '/courses/:courseId/calendar/:calendarId/students/:studentId/history',
  authenticated,
  attendanceController.getAttendanceHistoryPage
)

module.exports = router
