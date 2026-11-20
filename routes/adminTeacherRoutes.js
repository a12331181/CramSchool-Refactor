const express = require('express')
const adminTeacherController = require('../controllers/adminTeacherController')
const { authenticatedAdmin } = require('../middlewares/auth')
const router = express.Router()

router.use(authenticatedAdmin)

router.get(
  '/',
  adminTeacherController.getTeacherListPage
)

router.get(
  '/:teacherId',
  adminTeacherController.getTeacherDetailsPage
)

router.get(
  '/:teacherId/edit',
  adminTeacherController.getEditTeacherPage
)

router.put(
  '/:teacherId',
  adminTeacherController.updateTeacher
)

module.exports = router