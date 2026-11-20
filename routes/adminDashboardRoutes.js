const { Router } = require('express')
const { authenticatedAdmin } = require('../middlewares/auth')
const adminDashboardController = require('../controllers/adminDashboardController')

const router = Router()

router.get('/', authenticatedAdmin, (req, res) => res.redirect('/admin/cramschool'))
router.get('/cramschool', authenticatedAdmin, adminDashboardController.getAdminDashboardPage)

module.exports = router
