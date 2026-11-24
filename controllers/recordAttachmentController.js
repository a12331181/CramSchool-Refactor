// 檢查附件與原紀錄的關係，回傳圖片或下載文件。

const responses = require('../constants/messages/recordAttachment')

const records = require('../services/recordAttachmentService')

const { sendPageError } = require('../utils/pageError')

async function download(req, res) {
  if (Object.values(req.params).some(value => !/^[1-9]\d{0,9}$/.test(value))) return sendPageError(res, 404, responses.downloadNotFoundAttachment)
  const file = await records.getRecordFile(req.params)
  if (!file) return sendPageError(res, 404, responses.downloadNotFoundAttachment)
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" })
  if (!file.mime.startsWith('image/') || req.query.download === '1') res.attachment(file.name)
  return res.type(file.mime).send(file.data)
}
module.exports = { download }
