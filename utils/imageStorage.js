const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const uploadDir = path.join(__dirname, '..', 'upload')
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')
const JPEG_SIGNATURE = Buffer.from('ffd8ff', 'hex')

class UnsupportedImageError extends Error {}

async function getImageExtension(sourcePath) {
  const file = await fs.open(sourcePath, 'r')
  const header = Buffer.alloc(12)
  try {
    const { bytesRead } = await file.read(header, 0, header.length, 0)
    const bytes = header.subarray(0, bytesRead)
    if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return '.png'
    if (bytes.subarray(0, 3).equals(JPEG_SIGNATURE)) return '.jpg'
    if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return '.gif'
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return '.webp'
    throw new UnsupportedImageError('Unsupported image format')
  } finally {
    await file.close()
  }
}

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

async function saveImage({ sourcePath }) {
  const filename = randomUUID() + await getImageExtension(sourcePath)
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
  UnsupportedImageError,
  saveImage,
  discardImage,
  discardTempFile
}
