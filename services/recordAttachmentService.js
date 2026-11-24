// 驗證校務附件、組合受限格式的內文，並讀取指定紀錄的檔案。

const path = require('node:path')

const yauzl = require('yauzl')

const { Diary, Meeting, RecordAttachment, sequelize } = require('../models')

const allowed = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

function isWordDocument(buffer) {
  return new Promise(resolve =>
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return resolve(false)
      let types = false,
        document = false,
        expanded = 0,
        entries = 0
      const invalid = () => {
        zip.close()
        resolve(false)
      }
      zip.on('error', invalid)
      zip.on('end', () => resolve(types && document))
      zip.on('entry', entry => {
        expanded += entry.uncompressedSize
        if (
          ++entries > 2000 ||
          expanded > 32 * 1024 * 1024 ||
          entry.generalPurposeBitFlag & 1 ||
          /vbaProject|^word\/embeddings\//i.test(entry.fileName)
        )
          return invalid()
        if (entry.fileName === '[Content_Types].xml') types = true
        if (entry.fileName === 'word/document.xml') document = true
        zip.readEntry()
      })
      zip.readEntry()
    })
  )
}

async function validateUploads(files = []) {
  const result = []
  for (const file of files) {
    const name = path
      .basename(file.originalname.replaceAll('\\', '/'))
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .slice(0, 180)
    const mime = allowed[path.extname(name).toLowerCase()]
    const data = file.buffer
    const matches =
      mime === 'image/jpeg'
        ? data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        : mime === 'image/png'
          ? data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
          : mime === 'application/pdf'
            ? data.subarray(0, 5).toString() === '%PDF-'
            : mime === allowed['.docx'] && (await isWordDocument(data))
    if (!matches) return null
    result.push({ name, mime, data })
  }
  return result
}

async function createSchoolRecord(model, values, files) {
  const owner = model === Diary ? 'DiaryId' : 'MeetingId'
  return sequelize.transaction(async transaction => {
    const record = await model.create(values, { transaction })
    for (const file of files) await RecordAttachment.create({ ...file, [owner]: record.id }, { transaction })
    return record
  })
}

async function recordContents(record, kind, baseUrl) {
  const owner = kind === 'diary' ? 'DiaryId' : 'MeetingId'
  const rows = await RecordAttachment.findAll({
    attributes: ['id', 'name', 'mime'],
    where: { [owner]: record.id },
    order: [['id', 'ASC']],
    raw: true
  })
  const attachments = rows.map(row => ({
    ...row,
    image: row.mime.startsWith('image/'),
    url: baseUrl + '/attachments/' + row.id
  }))
  if (!record.richText) return { attachments }
  const blocks = String(record.content)
    .split(/\r?\n/)
    .map(text => {
      const list = text.startsWith('- ')
      const parts = (list ? text.slice(2) : text).split(/(\*\*[^*]+\*\*|\[\[圖片[1-3]\]\])/g).map(value => {
        if (value.startsWith('**') && value.endsWith('**')) return { bold: value.slice(2, -2) }
        const ref = /^\[\[圖片([1-3])\]\]$/.exec(value)
        if (ref && attachments[Number(ref[1]) - 1]?.image) return { picture: attachments[Number(ref[1]) - 1] }
        return { text: value }
      })
      return { list, parts }
    })
  return { attachments, blocks }
}

async function getRecordFile({ courseId, diaryId, meetingId, fileId }) {
  if (diaryId && !(await Diary.count({ where: { id: diaryId, CourseId: courseId } }))) return null
  if (meetingId && !(await Meeting.count({ where: { id: meetingId } }))) return null
  return RecordAttachment.unscoped().findOne({
    where: { id: fileId, ...(diaryId ? { DiaryId: diaryId } : { MeetingId: meetingId }) },
    raw: true
  })
}
module.exports = { validateUploads, createSchoolRecord, recordContents, getRecordFile }
