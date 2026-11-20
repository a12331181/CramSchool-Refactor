const userService = require('../services/userService')

const adminUserController = {
  getUserListPage: async (_req, res) => {
    const users = await userService.getAdminUserList()
    return res.render('admin/users/index', { users })
  },

  toggleUserAdmin: async (req, res) => {
    const userId = Number(req.params.userId)
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).send('帳號 ID 必須是正整數')

    const changed = await userService.toggleUserAdmin(userId)
    req.flash(
      changed ? 'success_messages' : 'error_messages',
      changed ? '使用者權限已更新' : '找不到使用者'
    )
    return res.redirect(303, '/admin/users')
  }
}

module.exports = adminUserController
