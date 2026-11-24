const responses = require('../constants/messages/adminUser')
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
      return sendPageError(res, 403, responses.createTeacherInvitationInvalidInvitation)
    }
    const result = await invitationService.createTeacherInvitation({ email, actorId: req.user.id })
    if (result.code === 'FORBIDDEN') return sendPageError(res, 403)
    if (!result.ok) {
      req.flash('error_messages', result.code === 'EMAIL_EXISTS' ? responses.createTeacherInvitationUnchangedEmailAccount : responses.createTeacherInvitationInvalidEmailTeacher)
      return res.redirect(303, '/admin/users')
    }
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
    return res.render('admin/users/invitation', {
      email: result.email, expiresAt: formatTaipeiDateTime(result.expiresAt), signupPath: '/signup?invite=' + result.token
    })
  },

  toggleUserAdmin: async (req, res) => {
    const userId = Number(req.params.userId)
    if (!Number.isSafeInteger(userId) || userId < 1) return sendPageError(res, 400, responses.toggleUserAdminInvalidAccount)

    const requestedRole = req.body?.isAdmin
    if (!['true', 'false'].includes(requestedRole)) {
      req.flash('error_messages', responses.toggleUserAdminInvalid)
      return res.redirect(303, '/admin/users')
    }
    const result = await userService.setUserAdmin({
      userId, actorId: req.user.id, isAdmin: requestedRole === 'true'
    })
    if (result.code === 'FORBIDDEN') return sendPageError(res, 403)
    const errors = responses.toggleUserAdminErrors
    req.flash(result.ok ? 'success_messages' : 'error_messages', result.ok ? responses.toggleUserAdminSaved : errors[result.code])
    return res.redirect(303, '/admin/users')
  }
}

module.exports = adminUserController
