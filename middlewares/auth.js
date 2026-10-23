function authenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/signin')
  }

  return next()
}

function authenticatedAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/signin')
  }

  if (!req.user.isAdmin) {
    return res.redirect('/')
  }

  return next()
}

module.exports = {
  authenticated,
  authenticatedAdmin
}