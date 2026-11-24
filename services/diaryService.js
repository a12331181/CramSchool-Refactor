// 讀寫課程日誌，並檢查作者與管理員的刪除資格。

const { Course, Diary, Teacher, sequelize } = require('../models')

const { createSchoolRecord } = require('./recordAttachmentService')
const { getTeacherAccountInclude } = require('./teacherService')

function activeCourseInclude() {
  return { model: Course, attributes: ['id', 'courseNo', 'name'], where: { isActive: true } }
}

function diaryAuthorInclude() {
  return { model: Teacher, attributes: ['name', 'UserId'], include: [getTeacherAccountInclude()], required: false }
}

function canDeleteDiary(diary, viewer) {
  return Number.isSafeInteger(viewer?.id) && (Boolean(viewer.isAdmin) || diary.Teacher?.UserId === viewer.id)
}

function withDeletePermissions(page, viewer) {
  return {
    count: page.count,
    rows: page.rows.map(diary => ({ ...diary, canDelete: canDeleteDiary(diary, viewer) }))
  }
}

function getRecentDiaries(limit) {
  return Diary.findAll({
    attributes: ['id', 'date', 'subject'],
    raw: true,
    nest: true,
    limit,
    include: [activeCourseInclude()],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  })
}

async function getDiariesPage({ offset, limit, viewer }) {
  const page = await Diary.findAndCountAll({
    attributes: ['id', 'date', 'subject'],
    raw: true,
    nest: true,
    include: [activeCourseInclude(), diaryAuthorInclude()],
    offset,
    limit,
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  })
  return withDeletePermissions(page, viewer)
}

async function getCourseDiariesPage({ courseId, offset, limit, viewer }) {
  const course = await Course.findOne({ attributes: ['id', 'courseNo', 'name'], raw: true, where: { id: courseId, isActive: true } })
  if (!course) return null

  const diaries = await Diary.findAndCountAll({
    raw: true,
    nest: true,
    attributes: ['id', 'date', 'subject'],
    include: [{ model: Teacher, attributes: ['UserId'], required: false }],
    where: { CourseId: courseId },
    offset,
    limit,
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  })
  return { course, diaries: withDeletePermissions(diaries, viewer) }
}

function getDiaryDetails({ courseId, diaryId }) {
  return Diary.findOne({ raw: true, nest: true, where: { id: diaryId, CourseId: courseId }, include: [diaryAuthorInclude()] })
}

async function getCreateDiaryFormData({ courseId, userId }) {
  const [course, teacher] = await Promise.all([
    Course.findOne({ attributes: ['id', 'courseNo', 'name'], raw: true, where: { id: courseId, isActive: true } }),
    Teacher.findOne({ attributes: ['id'], raw: true, where: { UserId: userId } })
  ])
  return course && teacher ? course : null
}

async function createDiary({ courseId, userId, date, subject, content, attachments = [], richText = false }) {
  const [course, teacher] = await Promise.all([
    Course.findOne({ attributes: ['id'], raw: true, where: { id: courseId, isActive: true } }),
    Teacher.findOne({ attributes: ['id'], raw: true, where: { UserId: userId } })
  ])
  if (!course || !teacher) return false

  return createSchoolRecord(Diary, { date, subject, content, richText, TeacherId: teacher.id, CourseId: course.id }, attachments)
}

async function deleteDiary({ diaryId, courseId, viewer }) {
  const where = { id: diaryId }
  if (courseId !== undefined) where.CourseId = courseId
  return sequelize.transaction(async transaction => {
    const diary = await Diary.findOne({
      where,
      include: [{ model: Teacher, attributes: ['UserId'], required: false }],
      transaction,
      lock: transaction.LOCK.UPDATE
    })
    if (!diary) return { ok: false, code: 'NOT_FOUND' }
    if (!canDeleteDiary(diary, viewer)) return { ok: false, code: 'FORBIDDEN' }
    await diary.destroy({ transaction })
    return { ok: true }
  })
}

module.exports = {
  getRecentDiaries,
  getDiariesPage,
  getCourseDiariesPage,
  getDiaryDetails,
  getCreateDiaryFormData,
  createDiary,
  deleteDiary
}
