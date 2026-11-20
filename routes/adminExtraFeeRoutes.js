const { Router } = require('express')
const { authenticatedAdmin } = require('../middlewares/auth')
const adminController = require('../controllers/adminController')

const router = Router()

router.get('/', authenticatedAdmin, adminController.getExtraFees)
router.get('/create', authenticatedAdmin, adminController.getCreateExtraFeePage)
router.post('/', authenticatedAdmin, adminController.createExtraFee)
router.get('/:id/edit', authenticatedAdmin, adminController.getEditExtraFeePage)
router.put('/:id', authenticatedAdmin, adminController.updateExtraFee)

module.exports = router
