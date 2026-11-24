// 依台北日期、教室、教師或學生查詢課堂與今日點名進度。

const { Op, UniqueConstraintError } = require('sequelize')

const { Calendar, Course, Classroom, Teacher, Student, Enrollment, Attend } = require('../models')

const STATUS = require('../constants/courseSessionStatus')
const labels = require('../constants/courseSessionStatusLabels')

const { getConfirmedSessionEnrollment } = require('./courseSessionEnrollmentRules')

const { parseTaipeiDateTime, getTaipeiDate, formatTaipeiDateTime } = require('../utils/date')

function shiftDay(day, days) {
  const instant = parseTaipeiDateTime(day + 'T12:00')
  return getTaipeiDate(new Date(instant.getTime() + days * 86400000))
}

function rangeFor(day, mode) {
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay()
  const start = mode === 'week' ? shiftDay(day, -((weekday + 6) % 7)) : day
  const length = mode === 'week' ? 7 : 1
  return { start, length, end: shiftDay(start,length) }
}

function approvedOn(rows, day) {
  return getConfirmedSessionEnrollment(rows.filter(row => ['active','ended'].includes(row.status) && (!row.startsOn || row.startsOn <= day) && (!row.endsOn || row.endsOn > day)))
}

function display(row) {
  const start = formatTaipeiDateTime(row.startAt), end = formatTaipeiDateTime(row.endAt)
  return { ...row, startDay: start?.slice(0,10), time: start && end ? start.slice(11) + '–' +
    (start.slice(0,10) === end.slice(0,10) ? end.slice(11) : end) : '時間待補',
    courseName: row.Course?.name, roomName: row.Classroom?.name || '尚未指定教室',
    teacherName: row.Teacher?.name, label: labels[row.status] || '時間待補',
    cancelled: row.status === STATUS.CANCELLED, canMove: row.status === STATUS.SCHEDULED,
    roster: '/cramschool/attend/courses/' + row.CourseId + '/calendar/' + row.id + '/students' }
}

const associations = [
  { model: Course, attributes: ['name','courseNo'] }, { model: Teacher, attributes: ['name','UserId'] },
  { model: Classroom, attributes: ['name'] }
]

async function getSchedule({ day, mode, courseId, teacherId, classroomId, studentId, userId, home = false }) {
  const range = rangeFor(day, mode)
  const scoped = {}
  if (courseId) scoped.CourseId = courseId
  if (teacherId) scoped.TeacherId = teacherId
  if (classroomId) scoped.ClassroomId = classroomId
  const include = associations.map(item => item.model === Teacher && userId ? { ...item, where: { UserId: userId }, required: true } : item)
  const membership = new Map()
  if (studentId) {
    const rows = await Enrollment.findAll({ where: { StudentId: studentId, ...(courseId && { CourseId: courseId }),
      [Op.and]: [{ [Op.or]: [{ startsOn: null },{ startsOn: { [Op.lt]: range.end } }] },
        { [Op.or]: [{ endsOn: null }, { endsOn: { [Op.gt]: range.start } }] }] }, raw: true })
    for (const row of rows) {
      if (!membership.has(row.CourseId)) membership.set(row.CourseId, [])
      membership.get(row.CourseId).push(row)
    }
    scoped.CourseId = [...membership.keys()]
  }
  const where = { ...scoped, startAt: { [Op.lt]: parseTaipeiDateTime(range.end + 'T00:00') },
    endAt: { [Op.gt]: parseTaipeiDateTime(range.start + 'T00:00') } }
  const rows = await Calendar.findAll({ where, include, order: [['startAt','ASC'],['id','ASC']], raw: true, nest: true })
  const visible = (row, date) => !studentId || approvedOn(membership.get(row.CourseId) || [], date)
  const sessions = rows.filter(row => visible(row, getTaipeiDate(row.startAt))).map(display)
  const legacy = home ? [] : await Calendar.findAll({ where: { ...scoped,
    [Op.or]: [{ startAt: null },{ endAt: null }], date: { [Op.gte]: range.start, [Op.lt]: range.end } },
    include, order: [['date','ASC'],['id','ASC']], raw: true, nest: true })
  return { range, sessions, legacy: legacy.filter(row => visible(row, row.date)).map(display) }
}

async function filterOptions() {
  const [courses, teachers, rooms, students] = await Promise.all([Course,Teacher,Classroom,Student].map(model =>
    model.findAll({ attributes: ['id','name', ...(model === Student ? ['studentNo'] : [])], order: [['name','ASC'],['id','ASC']], raw: true })))
  return { courses, teachers, rooms, students }
}

async function getTodaySessions(user) {
  const day = getTaipeiDate()
  const { sessions } = await getSchedule({ day, mode: 'day', userId: user.isAdmin ? null : user.id, home: true })
  if (!sessions.length) return []
  const [enrollments, attendance] = await Promise.all([
    Enrollment.findAll({ where: { CourseId: [...new Set(sessions.map(row => row.CourseId))] }, raw: true }),
    Attend.findAll({ attributes: ['CalendarId','StudentId'], where: { CalendarId: sessions.map(row => row.id) }, raw: true })
  ])
  return sessions.map(row => {
    const expected = new Map()
    for (const entry of enrollments.filter(entry => entry.CourseId === row.CourseId)) {
      if (!expected.has(entry.StudentId)) expected.set(entry.StudentId, [])
      expected.get(entry.StudentId).push(entry)
    }
    const marked = new Set(attendance.filter(entry => entry.CalendarId === row.id).map(entry => entry.StudentId))
    const count = [...expected].filter(([id, rows]) => approvedOn(rows,row.startDay) && !marked.has(id)).length
    return { ...row, attendanceText: row.cancelled ? row.label : count ? '待點 ' + count + ' 位' : marked.size ? '已點名' : '尚無可點名學生' }
  })
}
// 同名教室交由資料庫唯一索引處理，也涵蓋同時送出的表單。
async function addRoom(name) {
  try { await Classroom.create({ name }); return true }
  catch (error) { if (error instanceof UniqueConstraintError) return false; throw error }
}

function getSessionForEdit(courseId, sessionId) {
  return Calendar.findOne({ where: { id:sessionId, CourseId:courseId }, raw:true })
}

module.exports = { addRoom, getSessionForEdit, getSchedule, filterOptions, getTodaySessions, shiftDay }
