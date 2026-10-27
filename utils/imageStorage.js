const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const uploadDir = path.join(__dirname, '..', 'upload')

async function tryRemoveFile(filePath) {
  try {
    await fs.unlink(filePath)
    return true
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('清理檔案失敗：', filePath, error)
    }

    return false
  }
}

async function saveImage({ sourcePath, originalName }) {
  const filename = randomUUID() + path.extname(originalName)
  const destination = path.join(uploadDir, filename)

  await fs.mkdir(uploadDir, {
    recursive: true
  })

  try {
    await fs.copyFile(sourcePath, destination)
  } catch (error) {
    await tryRemoveFile(destination)
    throw error
  }

  return {
    filename,
    url: '/upload/' + filename
  }
}

async function discardImage(filename) {
  if (filename !== path.basename(filename)) {
    throw new Error('圖片檔名不正確')
  }

  return tryRemoveFile(
    path.join(uploadDir, filename)
  )
}

async function discardTempFile(tempPath) {
  return tryRemoveFile(tempPath)
}

module.exports = {
  saveImage,
  discardImage,
  discardTempFile
}