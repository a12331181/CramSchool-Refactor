const express = require('express')
const adminStudentController = require(
  '../controllers/adminStudentController'
)
const { authenticatedAdmin } = require('../middlewares/auth')
const upload = require('../middlewares/upload')

const router = express.Router()

router.use(authenticatedAdmin)

router.get(
  '/',
  adminStudentController.getStudents
)

router.get(
  '/create',
  adminStudentController.getCreateStudentPage
)

router.post(
  '/',
  upload.single('image'),
  adminStudentController.postStudent
)

router.get(
  '/:id',
  adminStudentController.getStudent
)

router.get(
  '/:id/edit',
  adminStudentController.editStudent
)

router.put(
  '/:id',
  upload.single('image'),
  adminStudentController.putStudent
)

router.delete(
  '/:id',
  adminStudentController.deleteStudent
)

module.exports = router