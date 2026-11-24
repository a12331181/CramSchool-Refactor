// 處理額外費用項目的新增、編輯及刪除。

const { MAX_EXTRA_FEE_PRICE } = require('../constants/extraFeeLimits')
const responses = require('../constants/messages/adminExtraFee')

const extraFeeService = require('../services/extraFeeService')

const adminExtraFeeController = {
  getExtraFeeListPage: async (_req, res) => {
    const extrafees = await extraFeeService.getExtraFees()
    return res.render('admin/extra-fees/index', { extrafees })
  },

  getCreateExtraFeePage: (_req, res) => {
    return res.render('admin/extra-fees/form', { maxPrice: MAX_EXTRA_FEE_PRICE })
  },

  getEditExtraFeePage: async (req, res) => {
    const extrafee = await extraFeeService.getExtraFeeDetails(req.params.extraFeeId)
    if (!extrafee) return res.redirect('/admin/extrafees')

    return res.render('admin/extra-fees/form', { extrafee, maxPrice: MAX_EXTRA_FEE_PRICE })
  },

  createExtraFee: async (req, res) => {
    await extraFeeService.createExtraFee(req.body ?? {})
    req.flash('success_messages', responses.createExtraFeeSaved)
    return res.redirect(303, '/admin/extrafees')
  },

  updateExtraFee: async (req, res) => {
    const updated = await extraFeeService.updateExtraFee(req.params.extraFeeId, req.body ?? {})
    req.flash(
      updated ? 'success_messages' : 'error_messages',
      updated ? responses.updateExtraFeeSaved : responses.updateExtraFeeNotFound
    )
    return res.redirect(303, '/admin/extrafees')
  }
}

module.exports = adminExtraFeeController
