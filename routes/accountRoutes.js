const { Router } = require('express')
const { authenticated } = require('../middlewares/auth')
const upload = require('../middlewares/upload')
const userController = require('../controllers/userController')

module.exports = passport => {
  const router = Router()

  router.get('/users/:id', authenticated, userController.getUser)
  router.get('/users/:id/edit', authenticated, userController.getEditUserPage)
  router.put('/users/:id', authenticated, upload.single('image'), userController.putUser)
  router.get('/signup', userController.signUpPage)
  router.post('/signup', userController.signUp)
  router.get('/signin', userController.signInPage)
  router.post('/signin', passport.authenticate('local', { failureRedirect: '/signin', failureFlash: true }), userController.signIn)
  router.get('/logout', userController.logout)

  return router
}
