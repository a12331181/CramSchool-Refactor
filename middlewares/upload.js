const multer = require('multer')
const path = require('node:path')

const upload = multer({
  dest: path.join(__dirname, '..', 'temp')
})

module.exports = upload