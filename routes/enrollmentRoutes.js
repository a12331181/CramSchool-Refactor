const express = require('express')
const enrollmentController = require('../controllers/enrollmentController')
const { authenticatedAdmin } = require('../middlewares/auth')

const router = express.Router()

router.get(
  '/:id/enrolls',
  authenticatedAdmin,
  enrollmentController.enrollCoursePage
)

router.post(
  '/:studentId/courses/:courseId/enrolls',
  authenticatedAdmin,
  enrollmentController.addEnrollment
)

router.delete(
  '/:studentId/courses/:courseId/enrolls',
  authenticatedAdmin,
  enrollmentController.removeEnrollment
)

module.exports = router