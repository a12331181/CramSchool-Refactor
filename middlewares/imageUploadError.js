const { sendPageError } = require('../utils/pageError')
const { MulterError } = require('multer')
const { MAX_IMAGE_SIZE_MB } = require('../constants/imageUpload')
const { UnsupportedImageError } = require('../utils/imageStorage')

function handleImageUploadError(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error instanceof UnsupportedImageError) {
    return sendPageError(res.type('text'), 400, '請上傳 JPG、PNG、GIF 或 WebP 圖片。')
  }
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return sendPageError(res.type('text'), 413, `圖片不可超過 ${MAX_IMAGE_SIZE_MB} MB。`)
    }
    return sendPageError(res.type('text'), 400, '每次只能上傳一張圖片。')
  }
  return next(error)
}

module.exports = handleImageUploadError
