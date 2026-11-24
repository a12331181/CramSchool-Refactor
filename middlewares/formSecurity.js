const { createSessionFormToken, isValidSessionFormToken } = require('../utils/sessionFormToken')
const { sendPageError } = require('../utils/pageError')
const { discardTempFile } = require('../utils/imageStorage')

function verifyForm(req, res, next) {
  const submitted = req.body?._csrf ?? req.get('X-CSRF-Token')
  if (isValidSessionFormToken(submitted, req.session.formSecurityToken)) return next()
  if (req.file?.path) return discardTempFile(req.file.path).then(() => deny(res), next)
  return deny(res)
}

function deny(res) {
  return sendPageError(res, 403, '表單已過期，請重新開啟頁面後再送出。')
}

function protectForms(req, res, next) {
  req.session.formSecurityToken ||= createSessionFormToken()
  res.locals.csrfToken = req.session.formSecurityToken
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.is('multipart/form-data')) {
    // 瀏覽器的上傳先檢查來源，再由上傳路由檢查解析後的表單 token。
    try {
      if (
        new URL(req.get('Origin')).host !== req.get('host') ||
        new URL(req.get('Origin')).protocol !== req.protocol + ':'
      )
        return deny(res)
    } catch {
      return deny(res)
    }
    return next()
  }
  return verifyForm(req, res, next)
}

module.exports = { protectForms, verifyForm }
