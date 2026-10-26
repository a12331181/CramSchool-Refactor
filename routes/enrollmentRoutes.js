const express = require('express')
const enrollmentController = require('../controllers/enrollmentController')
const { authenticatedAdmin } = require('../middlewares/auth')
const router = express.Router()

router.use(authenticatedAdmin)

router.get(
  '/:id/enrolls',
  enrollmentController.enrollCoursePage
)

router.post(
  '/:studentId/courses/:courseId/enrolls',
  enrollmentController.addEnrollment
)

router.delete(
  '/:studentId/courses/:courseId/enrolls',
  enrollmentController.removeEnrollment
)

module.exports = router