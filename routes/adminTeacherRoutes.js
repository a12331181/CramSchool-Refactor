const express = require('express')
const adminTeacherController = require('../controllers/adminTeacherController')
const { authenticatedAdmin } = require('../middlewares/auth')
const router = express.Router()

router.use(authenticatedAdmin)

router.get(
  '/', 
  adminTeacherController.getTeachers
)

router.get(
  '/:id', 
  adminTeacherController.getTeacher
)

router.get(
  '/:id/edit', 
  adminTeacherController.editTeacher
)

router.put(
  '/:id', 
  adminTeacherController.updateTeacher
)

module.exports = router