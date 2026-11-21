const { MulterError } = require('multer')
const { MAX_IMAGE_SIZE_MB } = require('../constants/imageUpload')
const { UnsupportedImageError } = require('../utils/imageStorage')

function handleImageUploadError(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error instanceof UnsupportedImageError) {
    return res.status(400).type('text').send('請上傳 JPG、PNG、GIF 或 WebP 圖片。')
  }
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).type('text').send(`圖片不可超過 ${MAX_IMAGE_SIZE_MB} MB。`)
    }
    return res.status(400).type('text').send('每次只能上傳一張圖片。')
  }
  return next(error)
}

module.exports = handleImageUploadError
