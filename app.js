const express = require('express')
const { engine } = require('express-handlebars')
const bodyParser = require('body-parser')
const flash = require('connect-flash')
const session = require('express-session')
const passport = require('./config/passport')
const methodOverride = require('method-override')
const fs = require('fs')
const path = require('path')
const uploadDir = path.join(__dirname, 'upload')
const app = express()
const port = 3000

// setup handlebars
app.engine('handlebars', engine({
  defaultLayout: 'main',
  helpers: require('./config/handlebars-helpers')
})) 
app.set('view engine', 'handlebars')
// setup bodyParser
app.use(bodyParser.urlencoded({extended: true}))
// setup session and flash
app.use(session({ secret: 'secret', resave: false, saveUninitialized: false }))
// setup passport
app.use(passport.initialize())
app.use(passport.session())
// setup flash
app.use(flash())
app.use(methodOverride('_method'))

fs.mkdirSync(uploadDir, { recursive: true })
app.use('/upload', express.static(__dirname + '/upload'))

app.use((req, res, next) => {
  res.locals.success_messages = req.flash('success_messages')
  res.locals.error_messages = req.flash('error_messages')
  res.locals.user = req.user 
  next()
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
})

require('./routes')(app, passport)