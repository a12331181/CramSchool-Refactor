const { verifyForm } = require('../middlewares/formSecurity')
const studentDirectoryController = require('../controllers/studentDirectoryController')
const express = require('express')
const adminStudentController = require('../controllers/adminStudentController')
const upload = require('../middlewares/upload')

const router = express.Router()

router.get('/', studentDirectoryController.getAdminStudentListPage)

router.get('/create', adminStudentController.getCreateStudentPage)

router.post('/', upload.single('image'), verifyForm, adminStudentController.createStudent)

router.get('/:studentId', adminStudentController.getStudentDetailsPage)

router.get('/:studentId/edit', adminStudentController.getEditStudentPage)

router.put('/:studentId', upload.single('image'), verifyForm, adminStudentController.updateStudent)

router.delete('/:studentId', adminStudentController.deleteStudent)

module.exports = router
