const { Router } = require('express')
const { authenticatedAdmin } = require('../middlewares/auth')
const adminController = require('../controllers/adminController')

const router = Router()

router.get('/', authenticatedAdmin, adminController.getUsers)
router.put('/:id/toggleAdmin', authenticatedAdmin, adminController.toggleAdmin )

module.exports = router
