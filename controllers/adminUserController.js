const { sendPageError } = require('../utils/pageError')
const userService = require('../services/userService')
const invitationService = require('../services/teacherInvitationService')
const { createSessionFormToken, isValidSessionFormToken } = require('../utils/sessionFormToken')
const { formatTaipeiDateTime } = require('../utils/date')

const adminUserController = {
  getUserListPage: async (req, res) => {
    const users = await userService.getAdminUserList()
    const admins = users.filter(user => user.isAdmin)
    const lastAdminId = admins.length === 1 ? admins[0].id : null
    const inviteFormToken = req.session.inviteFormToken ??= createSessionFormToken()
    return res.render('admin/users/index', { users, lastAdminId, inviteFormToken })
  },

  createTeacherInvitation: async (req, res) => {
    const { email, inviteFormToken } = req.body ?? {}
    if (!isValidSessionFormToken(inviteFormToken, req.session.inviteFormToken)) {
      return sendPageError(res, 403, '邀請表單已失效，請重新開啟使用者管理。')
    }
    const result = await invitationService.createTeacherInvitation({ email, actorId: req.user.id })
    if (result.code === 'FORBIDDEN') return sendPageError(res, 403)
    if (!result.ok) {
      req.flash('error_messages', result.code === 'EMAIL_EXISTS' ? '這個信箱已有帳號。' : '請輸入有效的教師信箱。')
      return res.redirect(303, '/admin/users')
    }
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
    return res.render('admin/users/invitation', {
      email: result.email, expiresAt: formatTaipeiDateTime(result.expiresAt), signupPath: '/signup?invite=' + result.token
    })
  },

  toggleUserAdmin: async (req, res) => {
    const userId = Number(req.params.userId)
    if (!Number.isSafeInteger(userId) || userId < 1) return sendPageError(res, 400, '帳號 ID 必須是正整數')

    const requestedRole = req.body?.isAdmin
    if (!['true', 'false'].includes(requestedRole)) {
      req.flash('error_messages', '請重新載入使用者列表，再選擇要設定的權限。')
      return res.redirect(303, '/admin/users')
    }
    const result = await userService.setUserAdmin({
      userId, actorId: req.user.id, isAdmin: requestedRole === 'true'
    })
    if (result.code === 'FORBIDDEN') return sendPageError(res, 403)
    const errors = {
      LAST_ADMIN: '至少要保留一位管理員。請先指定另一位管理員，再變更這個帳號。',
      USER_NOT_FOUND: '找不到使用者'
    }
    req.flash(result.ok ? 'success_messages' : 'error_messages', result.ok ? '使用者權限已更新' : errors[result.code])
    return res.redirect(303, '/admin/users')
  }
}

module.exports = adminUserController
