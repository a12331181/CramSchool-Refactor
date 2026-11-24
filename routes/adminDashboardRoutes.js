const { Router } = require('express')

const adminDashboardController = require('../controllers/adminDashboardController')

const { authenticatedAdmin } = require('../middlewares/auth')

const router = Router()

router.get('/', authenticatedAdmin, (req, res) => res.redirect('/admin/cramschool'))
router.get('/cramschool', authenticatedAdmin, adminDashboardController.getAdminDashboardPage)

module.exports = router
