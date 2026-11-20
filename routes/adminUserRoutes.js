const { Router } = require('express')
const { authenticatedAdmin } = require('../middlewares/auth')
const adminUserController = require('../controllers/adminUserController')

const router = Router()

router.get('/', authenticatedAdmin, adminUserController.getUserListPage)
router.put('/:userId/toggleAdmin', authenticatedAdmin, adminUserController.toggleUserAdmin )

module.exports = router
