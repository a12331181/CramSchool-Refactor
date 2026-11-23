const { Router } = require('express')
const { authenticatedAdmin } = require('../middlewares/auth')
const adminCalendarController = require('../controllers/adminCalendarController')
const adminCourseController = require('../controllers/adminCourseController')

const router = Router()

router.get('/', authenticatedAdmin, adminCourseController.getCourseListPage)
router.get('/create', authenticatedAdmin, adminCourseController.getCreateCoursePage)
router.post('/', authenticatedAdmin, adminCourseController.createCourse)
router.get('/:courseId/edit', authenticatedAdmin, adminCourseController.getEditCoursePage)
router.put('/:courseId/close', authenticatedAdmin, adminCourseController.closeCourse)
router.put('/:courseId/open', authenticatedAdmin, adminCourseController.openCourse)
router.put('/:courseId', authenticatedAdmin, adminCourseController.updateCourse)
router.delete('/:courseId', authenticatedAdmin, adminCourseController.deleteCourse)
router.get('/:courseId/calendar', authenticatedAdmin, adminCalendarController.getCourseCalendarPage)
router.get(
  '/:courseId/sessions/create',
  authenticatedAdmin,
  adminCalendarController.getCreateCourseSessionPage
)
router.get(
  '/:courseId/calendar/:calendarId/edit',
  authenticatedAdmin,
  adminCalendarController.getLegacyCalendarEditPage
)
router.post('/:courseId/sessions', authenticatedAdmin, adminCalendarController.createCourseSession)
router.get(
  '/:courseId/sessions/batch/create',
  authenticatedAdmin,
  adminCalendarController.getCreateCourseSessionBatchPage
)
router.post(
  '/:courseId/sessions/batch',
  authenticatedAdmin,
  adminCalendarController.createCourseSessionBatch
)
router.put(
  '/:courseId/sessions/:sessionId/cancel',
  authenticatedAdmin,
  adminCalendarController.cancelCourseSession
)
router.put(
  '/:courseId/sessions/:sessionId/complete',
  authenticatedAdmin,
  adminCalendarController.completeCourseSession
)
router.put(
  '/:courseId/calendar/:calendarId',
  authenticatedAdmin,
  adminCalendarController.updateLegacyCalendar
)

module.exports = router
