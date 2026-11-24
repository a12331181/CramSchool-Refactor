const { UniqueConstraintError } = require('sequelize')
const { Classroom, Calendar } = require('../models')
const schedule = require('../services/timetableService')
const calendars = require('../services/calendarService')
const { showWarnings } = require('./adminCalendarController')
const { getTaipeiDate, parseTaipeiDateTime, formatTaipeiDateTime } = require('../utils/date')
const { sendPageError } = require('../utils/pageError')

async function timetable(req,res) {
  const day = req.query.date ?? getTaipeiDate()
  const mode = req.query.mode ?? (/Mobile|Android|iPhone/i.test(req.get('User-Agent') || '') ? 'day' : 'week')
  if (!parseTaipeiDateTime(day + 'T00:00') || !['day','week','rooms'].includes(mode)) return sendPageError(res,400,'課表日期或檢視方式不正確。')
  const filters = {}
  for (const name of ['courseId','teacherId','classroomId','studentId']) {
    if (req.query[name] === undefined || req.query[name] === '') continue
    if (typeof req.query[name] !== 'string' || !/^[1-9]\d{0,9}$/.test(req.query[name])) return sendPageError(res,400,'課表篩選條件不正確。')
    filters[name] = Number(req.query[name])
  }
  const [data, options] = await Promise.all([schedule.getSchedule({ day,mode,...filters }), schedule.filterOptions()])
  const days = Array.from({ length: data.range.length },(_,i) => schedule.shiftDay(data.range.start,i))
  const columns = mode === 'rooms' ? [...options.rooms, { id: null, name:'未指定教室' }]
    .filter(room => !filters.classroomId || room.id === filters.classroomId)
    .map(room => ({ name: room.name, rows: data.sessions.filter(row => row.ClassroomId === room.id) })) :
    days.map(date => ({ name: date.slice(5) + '（' + '日一二三四五六'[new Date(date + 'T12:00Z').getUTCDay()] + '）',
      rows: data.sessions.filter(row => row.startAt < parseTaipeiDateTime(schedule.shiftDay(date,1) + 'T00:00') &&
        row.endAt > parseTaipeiDateTime(date + 'T00:00')) }))
  const link = date => '/cramschool/timetable?' + new URLSearchParams({ date,mode,...filters })
  return res.render('school/schedule/index',{ workspaceTitle:'校務課表', activeNav:'timetable', day, mode, ...filters,
    ...options, columns, legacy:data.legacy, previous:link(schedule.shiftDay(day,-days.length)),
    next:link(schedule.shiftDay(day,days.length)), today:link(getTaipeiDate()) })
}

async function addRoom(req,res) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  if (!name || name.length > 80) return sendPageError(res,400,'請填寫 80 字以內的教室名稱。')
  try { await Classroom.create({ name }) } catch (error) {
    if (error instanceof UniqueConstraintError) return sendPageError(res,409,'已有同名教室。')
    throw error
  }
  return res.redirect(303,'/cramschool/timetable?mode=rooms')
}

async function editSession(req,res) {
  const { courseId, sessionId } = req.params
  const form = await calendars.getCreateCourseSessionFormData(Number(courseId))
  const row = await Calendar.findOne({ where:{ id:sessionId, CourseId:courseId }, raw:true })
  if (!form.ok || !row?.startAt || !row.endAt) return sendPageError(res,404,'找不到可調整的課堂。')
  return res.render('admin/calendars/create',{ ...form, workspaceTitle:'調整單堂課', editId:row.id, selectedRoom:row.ClassroomId,
    teachers:form.teachers.map(t=>({...t,isSelected:t.id===row.TeacherId})), canSubmit:true, version:row.version,
    values:{ startAt:formatTaipeiDateTime(row.startAt).replace(' ','T'),endAt:formatTaipeiDateTime(row.endAt).replace(' ','T'),content:row.content } })
}

async function moveSession(req,res) {
  const b=req.body
  if (typeof b.version !== 'string' || !/^\d+$/.test(b.version)) return sendPageError(res,400,'課堂版本無效。')
  const result = await calendars.createCourseSession(Number(req.params.courseId),{
    startAt:b.startAt,endAt:b.endAt,content:b.content,teacherId:Number(b.teacherId),
    classroomId:b.classroomId ? Number(b.classroomId) : null, conflictKey:b.conflictKey,
    editing:{ id:Number(req.params.sessionId), version:Number(b.version) }
  })
  if (result.code === 'STUDENT_CONFLICT') return showWarnings(req,res,result)
  if (!result.ok) return sendPageError(res,409,result.code === 'TIME_CONFLICT' ? '課程、教師或教室已有重疊課堂。' :
    '無法調課，請核對時段及版本。已點名、出帳或取消的課堂須保留原紀錄。')
  return res.redirect(303,'/cramschool/timetable?date=' + b.startAt.slice(0,10))
}
module.exports = { timetable, addRoom, editSession, moveSession }
