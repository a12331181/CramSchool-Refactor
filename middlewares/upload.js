const multer = require('multer')
const path = require('node:path')
const { MAX_IMAGE_SIZE_MB } = require('../constants/imageUpload')

const upload = multer({
  dest: path.join(__dirname, '..', 'temp'),
  limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024, files: 1 }
})

module.exports = upload
