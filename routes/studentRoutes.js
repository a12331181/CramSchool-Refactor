const studentDirectoryController = require('../controllers/studentDirectoryController')
const { Router } = require('express')
const { authenticated } = require('../middlewares/auth')
const studentController = require('../controllers/studentController')

const router = Router()

router.get('/', authenticated, studentDirectoryController.getStudentListPage)
router.get('/:studentId', authenticated, studentController.getStudentDetailsPage)
router.get(
  '/:studentId/courses/:courseId/attend',
  authenticated,
  studentController.getStudentAttendanceHistoryPage
)

module.exports = router
