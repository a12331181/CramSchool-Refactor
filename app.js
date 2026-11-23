const express = require('express')
const { engine } = require('express-handlebars')
const flash = require('connect-flash')
const session = require('express-session')
const passport = require('./config/passport')
const methodOverride = require('method-override')
const fs = require('node:fs')
const path = require('node:path')
const { getSessionSecret } = require('./utils/sessionConfig')
const { IMAGE_ACCEPT } = require('./constants/imageUpload')
const handleImageUploadError = require('./middlewares/imageUploadError')
const { authenticated } = require('./middlewares/auth')
const uploadDir = path.join(__dirname, 'upload')
const app = express()
app.locals.imageAccept = IMAGE_ACCEPT
app.use('/assets/workspace', express.static(path.join(__dirname, 'public', 'workspace')))
const port = 3000

// setup handlebars
app.engine('handlebars', engine({
  defaultLayout: 'workspace',
  helpers: require('./config/handlebars-helpers')
})) 
app.set('view engine', 'handlebars')
// setup bodyParser
app.use(express.urlencoded({ extended: true }))
// setup session and flash
app.use(session({ secret: getSessionSecret(), resave: false, saveUninitialized: false }))
// setup passport
app.use(passport.initialize())
app.use(passport.session())
// setup flash
app.use(flash())
app.use(methodOverride('_method'))

fs.mkdirSync(uploadDir, { recursive: true })
app.use('/upload', authenticated, express.static(uploadDir, {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', 'sandbox')
  }
}))

app.use((req, res, next) => {
  res.locals.success_messages = req.flash('success_messages')
  res.locals.error_messages = req.flash('error_messages')
  res.locals.user = req.user 
  next()
})

require('./routes')(app, passport)
app.use(handleImageUploadError)

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
  })
}

module.exports = app
