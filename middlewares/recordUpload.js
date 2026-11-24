const multer = require('multer')
const { sendPageError } = require('../utils/pageError')

const parse = multer({
  defParamCharset: 'utf8',
  storage: multer.memoryStorage(),
  limits: { files: 3, fileSize: 3 * 1024 * 1024, fields: 8, fieldSize: 65535, parts: 12 }
}).array('attachments', 3)

module.exports = (req, res, next) =>
  parse(req, res, error => {
    if (error) return sendPageError(res, 400, '每筆可附 3 個檔案，每檔最多 3 MB。')
    return next()
  })
