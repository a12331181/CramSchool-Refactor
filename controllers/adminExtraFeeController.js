const extraFeeService = require('../services/extraFeeService')

const adminExtraFeeController = {
  getExtraFeeListPage: async (_req, res) => {
    const extrafees = await extraFeeService.getExtraFees()
    return res.render('admin/extra-fees/index', { extrafees })
  },

  getCreateExtraFeePage: (_req, res) => {
    return res.render('admin/extra-fees/form')
  },

  getEditExtraFeePage: async (req, res) => {
    const extrafee = await extraFeeService.getExtraFeeDetails(req.params.extraFeeId)
    if (!extrafee) return res.redirect('/admin/extrafees')

    return res.render('admin/extra-fees/form', { extrafee })
  },

  createExtraFee: async (req, res) => {
    await extraFeeService.createExtraFee(req.body ?? {})
    req.flash('success_messages', '額外費用已成功建立')
    return res.redirect(303, '/admin/extrafees')
  },

  updateExtraFee: async (req, res) => {
    const updated = await extraFeeService.updateExtraFee(req.params.extraFeeId, req.body ?? {})
    req.flash(
      updated ? 'success_messages' : 'error_messages',
      updated ? '已成功更新額外費用' : '找不到額外費用'
    )
    return res.redirect(303, '/admin/extrafees')
  }
}

module.exports = adminExtraFeeController
