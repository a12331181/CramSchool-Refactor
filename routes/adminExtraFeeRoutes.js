const { sendPageError } = require('../utils/pageError')
const { Router } = require('express')
const { authenticatedAdmin } = require('../middlewares/auth')
const adminExtraFeeController = require('../controllers/adminExtraFeeController')

const { InvalidExtraFeePrice } = require('../utils/extraFeePrice')

const router = Router()

router.get('/', authenticatedAdmin, adminExtraFeeController.getExtraFeeListPage)
router.get('/create', authenticatedAdmin, adminExtraFeeController.getCreateExtraFeePage)
router.post('/', authenticatedAdmin, adminExtraFeeController.createExtraFee)
router.get('/:extraFeeId/edit', authenticatedAdmin, adminExtraFeeController.getEditExtraFeePage)
router.put('/:extraFeeId', authenticatedAdmin, adminExtraFeeController.updateExtraFee)

router.use((error, _req, res, next) => {
  if (error instanceof InvalidExtraFeePrice) return sendPageError(res, 400, error.message)
  return next(error)
})

module.exports = router
