const passport = require('passport')
const LocalStrategy = require('passport-local')
const bcrypt = require('bcryptjs')
const { User } = require('../models')

passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
  },
  async (req, username, password, done) => {
    let user
    let isValid
    try {
      user = await User.findOne({ attributes: ['id', 'password'], where: { email: username } })
      isValid = user != null && await bcrypt.compare(password, user.password)
    } catch (error) {
      return done(error)
    }

    if (!isValid) {
      req.flash('error_messages', '帳號或密碼輸入錯誤。')
      return done(null, false)
    }
    return done(null, user)
  }
))

passport.serializeUser((user, done) => {
  done(null, user.id)
})
passport.deserializeUser(async (id, done) => {
  let user
  try {
    user = await User.findByPk(id, { attributes: ['id', 'name', 'isAdmin'], raw: true })
  } catch (error) {
    return done(error)
  }

  return done(null, user ?? false)
})

module.exports = passport
