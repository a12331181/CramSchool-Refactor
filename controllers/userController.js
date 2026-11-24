const responses = require('../constants/messages/user')
const { sendPageError } = require('../utils/pageError')
const { SEX_OPTIONS } = require('../constants/profileOptions')
const { discardUnusedProfileImage } = require('../services/profileImageService')
const userService = require('../services/userService')
const imageStorage = require('../utils/imageStorage')
const { getActiveInvitation } = require('../services/teacherInvitationService')

const unavailableInvite = responses.invitationUnavailable

const userController = {
  loadTeacherInvitation: async (req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
    const token = req.method === 'POST' ? req.body?.inviteToken : req.query.invite
    const invite = await getActiveInvitation(token)
    if (!invite) return sendPageError(res, 410, unavailableInvite)
    res.locals.inviteToken = token
    res.locals.invitedEmail = invite.email
    return next()
  },

  getSignUpPage: (req, res) => {
    return res.render('account/sign-up', { layout: 'access', workspaceTitle: '教師註冊' })
  },

  signUp: async (req, res) => {
    const body = req.body ?? {}

    const signupPath = '/signup?invite=' + res.locals.inviteToken
    if (typeof body.email !== 'string' || body.email.trim().toLowerCase() !== res.locals.invitedEmail) {
      return sendPageError(res, 400, responses.signUpInvalidInvitationEmail)
    }
    if (body.passwordCheck !== body.password) {
      req.flash('error_messages', responses.signUpMessagePassword)
      return res.redirect(303, signupPath)
    }

    const result = await userService.signUp({
      name: body.name,
      email: body.email,
      password: body.password,
      realName: body.realName,
      phone: body.phone,
      inviteToken: res.locals.inviteToken
    })

    if (result.code === 'INVALID_INVITATION') return sendPageError(res, 410, unavailableInvite)
    if (!result.ok) {
      const errors = responses.signUpErrors

      req.flash('error_messages', errors[result.code] ?? responses.signUpUnavailable)
      return res.redirect(303, signupPath)
    }

    req.flash(
      'success_messages',
      responses.signUpSavedAccount + result.userNo
    )

    return res.redirect(303, '/signin')
  },

  getSignInPage: (req, res) => {
    return res.render('account/sign-in', { layout: 'access', workspaceTitle: '登入' })
  },

  signIn: (req, res) => {
    req.flash('success_messages', responses.signInSaved)
    res.redirect('/cramschool')
  },

  logout: (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err)
      }

      req.flash('success_messages', responses.logoutSaved)
      return res.redirect('/signin')
    })
  },
  getUserProfilePage: async (req, res) => {
    const userId = Number(req.params.userId)
    if (!Number.isSafeInteger(userId) || userId < 1) return res.redirect('/cramschool/teachers')

    const result = await userService.getTeacherProfile(userId)
    if (!result) return res.redirect('/cramschool/teachers')

    return res.render('account/profile', { ...result, userIsMatch: req.user.id === userId })
  },

  getEditUserPage: async (req, res) => {
    if (req.user.id !== Number(req.params.userId)) return res.redirect(`/users/${req.user.id}`)

    const user = await userService.getEditableTeacherProfile(req.user.id)
    if (!user) return res.redirect('/cramschool/teachers')

    return res.render('account/edit-profile', {
      profile: user, sexList: SEX_OPTIONS, hasListedSex: SEX_OPTIONS.includes(user.Teacher.sex)
    })
  },

  updateUserProfile: async (req, res) => {
    let uploadedImage
    let updated = false

    try {
      if (req.user.id !== Number(req.params.userId)) return res.redirect(303, `/users/${req.user.id}`)

      if (req.file) {
        uploadedImage = await imageStorage.saveImage({
          sourcePath: req.file.path
        })
      }

      updated = await userService.updateTeacherProfile(req.user.id, req.body ?? {}, uploadedImage?.url)
      req.flash(
        updated ? 'success_messages' : 'error_messages',
        updated ? responses.updateUserProfileSavedProfile : responses.updateUserProfileNotFoundTeacherProfile
      )
      return res.redirect(303, updated ? '/' : '/cramschool/teachers')
    } finally {
      if (uploadedImage && !updated) await discardUnusedProfileImage(uploadedImage.url)
      if (req.file) await imageStorage.discardTempFile(req.file.path)
    }
  }
}

module.exports = userController
