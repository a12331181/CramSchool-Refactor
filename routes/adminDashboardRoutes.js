const { Router } = require('express')
const { authenticatedAdmin } = require('../middlewares/auth')
const adminController = require('../controllers/adminController')

const router = Router()

router.get('/', authenticatedAdmin, (req, res) => res.redirect('/admin/cramschool'))
router.get('/cramschool', authenticatedAdmin, adminController.getSchoolIndexPage)

module.exports = router
