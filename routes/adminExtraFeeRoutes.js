const { Router } = require('express')
const { authenticatedAdmin } = require('../middlewares/auth')
const adminExtraFeeController = require('../controllers/adminExtraFeeController')

const router = Router()

router.get('/', authenticatedAdmin, adminExtraFeeController.getExtraFeeListPage)
router.get('/create', authenticatedAdmin, adminExtraFeeController.getCreateExtraFeePage)
router.post('/', authenticatedAdmin, adminExtraFeeController.createExtraFee)
router.get('/:extraFeeId/edit', authenticatedAdmin, adminExtraFeeController.getEditExtraFeePage)
router.put('/:extraFeeId', authenticatedAdmin, adminExtraFeeController.updateExtraFee)

module.exports = router
