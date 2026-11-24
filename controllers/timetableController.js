// 處理課表篩選、教室登記和單堂調課表單。

const responses = require('../constants/messages/timetable')

const calendars = require('../services/calendarService')
const schedule = require('../services/timetableService')

const { getTaipeiDate, parseTaipeiDateTime, formatTaipeiDateTime } = require('../utils/date')
const { sendPageError } = require('../utils/pageError')
const { layoutTimetable } = require('../utils/timetableLayout')

const { showWarnings } = require('./adminCalendarController')

async function timetable(req, res) {
  const day = req.query.date ?? getTaipeiDate()
  const mode = req.query.mode ?? (/Mobile|Android|iPhone/i.test(req.get('User-Agent') || '') ? 'day' : 'week')
  if (!parseTaipeiDateTime(day + 'T00:00') || !['day', 'week', 'rooms'].includes(mode))
    return sendPageError(res, 400, responses.timetableInvalidDate)
  const filters = {}
  for (const name of ['courseId', 'teacherId', 'classroomId', 'studentId']) {
    if (req.query[name] === undefined || req.query[name] === '') continue
    if (typeof req.query[name] !== 'string' || !/^[1-9]\d{0,9}$/.test(req.query[name]))
      return sendPageError(res, 400, responses.timetableInvalidFilter)
    filters[name] = Number(req.query[name])
  }
  const [data, options] = await Promise.all([
    schedule.getSchedule({ day, mode, ...filters }),
    schedule.filterOptions()
  ])
  const days = Array.from({ length: data.range.length }, (_, i) => schedule.shiftDay(data.range.start, i))
  const columns =
    mode === 'rooms'
      ? [...options.rooms, { id: null, name: '未指定教室' }]
          .filter(room => !filters.classroomId || room.id === filters.classroomId)
          .map(room => ({
            date: day,
            name: room.name,
            rows: data.sessions.filter(row => row.ClassroomId === room.id)
          }))
      : days.map(date => ({
          date,
          name: date.slice(5) + '（' + '日一二三四五六'[new Date(date + 'T12:00Z').getUTCDay()] + '）',
          rows: data.sessions.filter(
            row =>
              row.startAt < parseTaipeiDateTime(schedule.shiftDay(date, 1) + 'T00:00') &&
              row.endAt > parseTaipeiDateTime(date + 'T00:00')
          )
        }))
  const link = date => '/cramschool/timetable?' + new URLSearchParams({ date, mode, ...filters })
  return res.render('school/schedule/index', {
    workspaceTitle: '校務課表',
    activeNav: 'timetable',
    day,
    mode,
    ...filters,
    ...options,
    ...layoutTimetable(columns),
    legacy: data.legacy,
    previous: link(schedule.shiftDay(day, -days.length)),
    next: link(schedule.shiftDay(day, days.length)),
    today: link(getTaipeiDate())
  })
}

async function addRoom(req, res) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  if (!name || name.length > 80) return sendPageError(res, 400, responses.addRoomInvalidRoom)
  if (!(await schedule.addRoom(name))) return sendPageError(res, 409, responses.addRoomUnchangedRoom)
  return res.redirect(303, '/cramschool/timetable?mode=rooms')
}

async function editSession(req, res) {
  const { courseId, sessionId } = req.params
  const form = await calendars.getCreateCourseSessionFormData(Number(courseId))
  const row = await schedule.getSessionForEdit(courseId, sessionId)
  if (!form.ok || !row?.startAt || !row.endAt)
    return sendPageError(res, 404, responses.editSessionNotFoundSession)
  return res.render('admin/calendars/create', {
    ...form,
    workspaceTitle: '調整單堂課',
    editId: row.id,
    selectedRoom: row.ClassroomId,
    teachers: form.teachers.map(t => ({ ...t, isSelected: t.id === row.TeacherId })),
    canSubmit: true,
    version: row.version,
    values: {
      startAt: formatTaipeiDateTime(row.startAt).replace(' ', 'T'),
      endAt: formatTaipeiDateTime(row.endAt).replace(' ', 'T'),
      content: row.content
    }
  })
}

async function moveSession(req, res) {
  const b = req.body
  if (typeof b.version !== 'string' || !/^\d+$/.test(b.version))
    return sendPageError(res, 400, responses.moveSessionInvalidSessionVersion)
  const result = await calendars.createCourseSession(Number(req.params.courseId), {
    startAt: b.startAt,
    endAt: b.endAt,
    content: b.content,
    teacherId: Number(b.teacherId),
    classroomId: b.classroomId ? Number(b.classroomId) : null,
    conflictKey: b.conflictKey,
    editing: { id: Number(req.params.sessionId), version: Number(b.version) }
  })
  if (result.code === 'STUDENT_CONFLICT') return showWarnings(req, res, result)
  if (!result.ok)
    return sendPageError(
      res,
      409,
      result.code === 'TIME_CONFLICT'
        ? responses.moveSessionUnchangedTeacherCourseSession
        : responses.moveSessionUnavailableSessionRecordAttendance
    )
  return res.redirect(303, '/cramschool/timetable?date=' + b.startAt.slice(0, 10))
}
module.exports = { timetable, addRoom, editSession, moveSession }
