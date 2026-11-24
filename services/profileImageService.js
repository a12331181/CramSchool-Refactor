// 管理教師頭像上傳、替換及未使用的暫存檔案。

const { Student, Teacher } = require('../models')

const imageStorage = require('../utils/imageStorage')

// Current and earlier uploads used generated filenames. Leave named assets and external URLs alone.
const localUpload = /^\/upload\/((?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})(?:\.[a-z0-9]+)?)$/i

async function discardUnusedProfileImage(url) {
  const match = typeof url === 'string' && localUpload.exec(url)
  if (!match) return

  try {
    const query = { where: { image: url }, attributes: ['id'], raw: true }
    const [student, teacher] = await Promise.all([Student.findOne(query), Teacher.findOne(query)])
    if (!student && !teacher) await imageStorage.discardImage(match[1])
  } catch (error) {
    // A cleanup failure must never undo a saved profile or remove an image with unknown ownership.
    console.error('無法確認或清理舊照片', error.message)
  }
}

module.exports = { discardUnusedProfileImage }
