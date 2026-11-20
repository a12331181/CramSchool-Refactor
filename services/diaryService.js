const { getTeacherAccountInclude } = require('./teacherService')
const { Course, Diary, Teacher, User } = require('../models')

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
  const course = await Course.findOne({ raw: true, nest: true, where: { id: courseId, isActive: true } })
  if (!course) return null

  const diaries = await Diary.findAndCountAll({
    raw: true,
    nest: true,
    where: { CourseId: courseId },
    include: { model: Course, include: { model: Teacher } },
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
  const [course, user] = await Promise.all([
    Course.findOne({ raw: true, nest: true, include: [Teacher], where: { id: courseId, isActive: true } }),
    User.findByPk(userId, { raw: true, nest: true, include: [Teacher] })
  ])
  return course && user?.Teacher?.id ? { course, user } : null
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
