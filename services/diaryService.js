const { getTeacherAccountInclude } = require('./teacherService')
const { Course, Diary, Teacher } = require('../models')

function activeCourseWithTeacher() {
  return { model: Course, where: { isActive: true }, include: [{ model: Teacher, attributes: ['name'], include: [getTeacherAccountInclude()] }] }
}

function getRecentDiaries(limit) {
  return Diary.findAll({
    raw: true,
    nest: true,
    limit,
    include: [activeCourseWithTeacher()],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  })
}

function getDiariesPage({ offset, limit }) {
  return Diary.findAndCountAll({
    raw: true,
    nest: true,
    include: [activeCourseWithTeacher()],
    offset,
    limit,
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  })
}

async function getCourseDiariesPage({ courseId, offset, limit }) {
  const course = await Course.findOne({ attributes: ['id', 'courseNo', 'name'], raw: true, where: { id: courseId, isActive: true } })
  if (!course) return null

  const diaries = await Diary.findAndCountAll({
    raw: true,
    nest: true,
    attributes: ['id', 'date', 'subject'],
    where: { CourseId: courseId },
    offset,
    limit,
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  })
  return { course, diaries }
}

function getDiaryDetails({ courseId, diaryId }) {
  return Diary.findOne({ raw: true, nest: true, where: { id: diaryId, CourseId: courseId }, include: [{ model: Teacher, attributes: ['name'], include: [getTeacherAccountInclude()] }] })
}

async function getCreateDiaryFormData({ courseId, userId }) {
  const [course, teacher] = await Promise.all([
    Course.findOne({ attributes: ['id', 'courseNo', 'name'], raw: true, where: { id: courseId, isActive: true } }),
    Teacher.findOne({ attributes: ['id'], raw: true, where: { UserId: userId } })
  ])
  return course && teacher ? course : null
}

async function createDiary({ courseId, userId, date, subject, content }) {
  const [course, teacher] = await Promise.all([
    Course.findOne({ attributes: ['id'], raw: true, where: { id: courseId, isActive: true } }),
    Teacher.findOne({ attributes: ['id'], raw: true, where: { UserId: userId } })
  ])
  if (!course || !teacher) return false

  await Diary.create({ date, subject, content, TeacherId: teacher.id, CourseId: course.id })
  return true
}

async function deleteDiary({ diaryId, courseId }) {
  const where = { id: diaryId }
  if (courseId !== undefined) where.CourseId = courseId
  const diary = await Diary.findOne({ where })
  if (!diary) return false

  await diary.destroy()
  return true
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
