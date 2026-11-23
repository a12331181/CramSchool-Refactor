const { Router } = require('express')
const { authenticated } = require('../middlewares/auth')
const upload = require('../middlewares/upload')
const userController = require('../controllers/userController')

module.exports = passport => {
  const router = Router()

  router.get('/users/:userId', authenticated, userController.getUserProfilePage)
  router.get('/users/:userId/edit', authenticated, userController.getEditUserPage)
  router.put(
    '/users/:userId',
    authenticated,
    upload.single('image'),
    userController.updateUserProfile
  )
  router.get('/signup', userController.loadTeacherInvitation, userController.getSignUpPage)
  router.post('/signup', userController.loadTeacherInvitation, userController.signUp)
  router.get('/signin', userController.getSignInPage)
  router.post(
    '/signin',
    passport.authenticate('local', { failureRedirect: '/signin', failureFlash: true }),
    userController.signIn
  )
  router.get('/logout', userController.logout)

  return router
}
