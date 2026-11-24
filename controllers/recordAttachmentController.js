const records = require('../services/recordAttachmentService')
const { sendPageError } = require('../utils/pageError')

async function download(req, res) {
  if (Object.values(req.params).some(value => !/^[1-9]\d{0,9}$/.test(value))) return sendPageError(res, 404, '找不到附件。')
  const file = await records.getRecordFile(req.params)
  if (!file) return sendPageError(res, 404, '找不到附件。')
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" })
  if (!file.mime.startsWith('image/') || req.query.download === '1') res.attachment(file.name)
  return res.type(file.mime).send(file.data)
}
module.exports = { download }
