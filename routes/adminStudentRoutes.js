const express = require('express')
const adminStudentController = require('../controllers/adminStudentController')
const upload = require('../middlewares/upload')

const router = express.Router()

router.get('/', adminStudentController.getStudentListPage)

router.get('/create', adminStudentController.getCreateStudentPage)

router.post('/', upload.single('image'), adminStudentController.createStudent)

router.get('/:studentId', adminStudentController.getStudentDetailsPage)

router.get('/:studentId/edit', adminStudentController.getEditStudentPage)

router.put('/:studentId', upload.single('image'), adminStudentController.updateStudent)

router.delete('/:studentId', adminStudentController.deleteStudent)

module.exports = router
