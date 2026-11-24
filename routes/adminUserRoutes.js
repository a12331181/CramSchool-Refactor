const { Router } = require('express')

const adminUserController = require('../controllers/adminUserController')

const { authenticatedAdmin } = require('../middlewares/auth')

const router = Router()

router.get('/', authenticatedAdmin, adminUserController.getUserListPage)
router.post('/invitations', authenticatedAdmin, adminUserController.createTeacherInvitation)
router.put('/:userId/toggleAdmin', authenticatedAdmin, adminUserController.toggleUserAdmin)

module.exports = router
