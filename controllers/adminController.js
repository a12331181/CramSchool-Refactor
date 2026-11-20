const userService = require('../services/userService')
const extraFeeService = require('../services/extraFeeService')

const adminController = {
  // 後臺首頁
  getSchoolIndexPage: (req, res) => {
    return res.render('admin/dashboard')
  },

  // 使用者相關程式碼
  getUsers: async (_req, res) => {
    const users = await userService.getAdminUserList()
    return res.render('admin/users/index', { users })
  },

  toggleAdmin: async (req, res) => {
    const userId = Number(req.params.id)
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).send('帳號 ID 必須是正整數')

    const changed = await userService.toggleUserAdmin(userId)
    req.flash(
      changed ? 'success_messages' : 'error_messages',
      changed ? '使用者權限已更新' : '找不到使用者'
    )
    return res.redirect(303, '/admin/users')
  },

  getExtraFees: async (_req, res) => {
    const extrafees = await extraFeeService.getExtraFees()
    return res.render('admin/extra-fees/index', { extrafees })
  },

  getCreateExtraFeePage: (_req, res) => {
    return res.render('admin/extra-fees/form')
  },

  getEditExtraFeePage: async (req, res) => {
    const extrafee = await extraFeeService.getExtraFeeDetails(req.params.id)
    if (!extrafee) return res.redirect('/admin/extrafees')

    return res.render('admin/extra-fees/form', { extrafee })
  },

  createExtraFee: async (req, res) => {
    await extraFeeService.createExtraFee(req.body ?? {})
    req.flash('success_messages', '額外費用已成功建立')
    return res.redirect(303, '/admin/extrafees')
  },

  updateExtraFee: async (req, res) => {
    const updated = await extraFeeService.updateExtraFee(req.params.id, req.body ?? {})
    req.flash(
      updated ? 'success_messages' : 'error_messages',
      updated ? '已成功更新額外費用' : '找不到額外費用'
    )
    return res.redirect(303, '/admin/extrafees')
  },
}

module.exports = adminController