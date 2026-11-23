const { discardUnusedProfileImage } = require('../services/profileImageService')
const userService = require('../services/userService')
const imageStorage = require('../utils/imageStorage')
const { getActiveInvitation } = require('../services/teacherInvitationService')

const unavailableInvite = '這個教師邀請無法使用，請向管理員索取新的註冊連結。'

const userController = {
  loadTeacherInvitation: async (req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
    const token = req.method === 'POST' ? req.body?.inviteToken : req.query.invite
    const invite = await getActiveInvitation(token)
    if (!invite) return res.status(410).send(unavailableInvite)
    res.locals.inviteToken = token
    res.locals.invitedEmail = invite.email
    return next()
  },

  getSignUpPage: (req, res) => {
    return res.render('account/sign-up')
  },

  signUp: async (req, res) => {
    const body = req.body ?? {}

    const signupPath = '/signup?invite=' + res.locals.inviteToken
    if (typeof body.email !== 'string' || body.email.trim().toLowerCase() !== res.locals.invitedEmail) {
      return res.status(400).send('請使用管理員邀請的信箱。')
    }
    if (body.passwordCheck !== body.password) {
      req.flash('error_messages', '兩次密碼輸入不同！')
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

    if (result.code === 'INVALID_INVITATION') return res.status(410).send(unavailableInvite)
    if (!result.ok) {
      const errors = {
        INVALID_INPUT: '請完整填寫姓名、暱稱、信箱與密碼，文字欄位限 255 字以內。',
        INVALID_EMAIL: 'Email 格式不正確，例如 name@example.com。',
        INVALID_PHONE: '手機必須是 09 開頭的十位數字，例如 0912345678。',
        PASSWORD_TOO_LONG: '密碼過長，請縮短後再試。',
        EMAIL_EXISTS: '信箱重複！'
      }

      req.flash('error_messages', errors[result.code] ?? '目前無法註冊。')
      return res.redirect(303, signupPath)
    }

    req.flash(
      'success_messages',
      '成功註冊帳號！帳號編號：' + result.userNo
    )

    return res.redirect(303, '/signin')
  },

  getSignInPage: (req, res) => {
    return res.render('account/sign-in')
  },

  signIn: (req, res) => {
    req.flash('success_messages', '成功登入！')
    res.redirect('/cramschool')
  },

  logout: (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err)
      }

      req.flash('success_messages', '登出成功！')
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

    return res.render('account/edit-profile', { user })
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
        updated ? '已更新個人資料' : '找不到教師資料，未更新個人資料'
      )
      return res.redirect(303, updated ? '/' : '/cramschool/teachers')
    } finally {
      if (uploadedImage && !updated) await discardUnusedProfileImage(uploadedImage.url)
      if (req.file) await imageStorage.discardTempFile(req.file.path)
    }
  }
}

module.exports = userController
