const userService = require('../services/userService')

const adminUserController = {
  getUserListPage: async (_req, res) => {
    const users = await userService.getAdminUserList()
    const admins = users.filter(user => user.isAdmin)
    const lastAdminId = admins.length === 1 ? admins[0].id : null
    return res.render('admin/users/index', { users, lastAdminId })
  },

  toggleUserAdmin: async (req, res) => {
    const userId = Number(req.params.userId)
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).send('帳號 ID 必須是正整數')

    const requestedRole = req.body?.isAdmin
    if (!['true', 'false'].includes(requestedRole)) {
      req.flash('error_messages', '請重新載入使用者列表，再選擇要設定的權限。')
      return res.redirect(303, '/admin/users')
    }
    const result = await userService.setUserAdmin({
      userId, actorId: req.user.id, isAdmin: requestedRole === 'true'
    })
    if (result.code === 'FORBIDDEN') return res.sendStatus(403)
    const errors = {
      LAST_ADMIN: '至少要保留一位管理員。請先指定另一位管理員，再變更這個帳號。',
      USER_NOT_FOUND: '找不到使用者'
    }
    req.flash(result.ok ? 'success_messages' : 'error_messages', result.ok ? '使用者權限已更新' : errors[result.code])
    return res.redirect(303, '/admin/users')
  }
}

module.exports = adminUserController
