// 在交易內登記補課決定與目的課堂，連結原請假及折抵紀錄。

const { Op } = require('sequelize')

const {
  sequelize,
  Attend,
  Calendar,
  Course,
  Teacher,
  Student,
  MakeupLesson,
  TuitionBillItem,
  TuitionLeaveReview
} = require('../models')

const { STATES } = require('../constants/makeup')

const { formatTaipeiDateTime, parseTaipeiDateTime } = require('../utils/date')

const sessionIncludes = () => [
  { model: Course, attributes: ['id', 'name'] },
  { model: Teacher, attributes: ['name'] }
]
function sessionLabel(session) {
  return [
    session.Course?.name,
    formatTaipeiDateTime(session.startAt) || '時間待補',
    session.Teacher?.name,
    session.status === 'cancelled' ? '已取消' : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

async function list({ offset, limit, attendId, date }) {
  const scope = attendId ? { id: attendId } : {}
  const { count, rows } = await Attend.findAndCountAll({
    where: { ...scope, [Op.or]: [{ status: 'excused' }, { '$MakeupLesson.id$': { [Op.ne]: null } }] },
    include: [
      Student,
      { model: Calendar, include: sessionIncludes() },
      { model: MakeupLesson, include: [{ model: Calendar, as: 'target', include: sessionIncludes() }] }
    ],
    subQuery: false,
    order: [['id', 'DESC']],
    limit,
    offset
  })
  const ids = rows.map(row => row.id)
  const [items, reviews, targets] = await Promise.all([
    ids.length ? TuitionBillItem.findAll({ where: { ActiveLeaveAttendId: ids }, raw: true }) : [],
    ids.length
      ? TuitionLeaveReview.findAll({ where: { AttendId: ids }, order: [['id', 'DESC']], raw: true })
      : [],
    Calendar.findAll({
      where: {
        status: 'scheduled',
        startAt: {
          [Op.gte]: parseTaipeiDateTime(date + 'T00:00'),
          [Op.lt]: new Date(parseTaipeiDateTime(date + 'T00:00').getTime() + 86400000)
        }
      },
      include: sessionIncludes(),
      order: [
        ['startAt', 'ASC'],
        ['id', 'ASC']
      ]
    })
  ])
  return {
    count,
    targets: targets.map(s => ({ id: s.id, name: sessionLabel(s) })),
    rows: rows.map(raw => {
      const a = raw.toJSON(),
        m = a.MakeupLesson,
        bill = items.find(item => item.ActiveLeaveAttendId === a.id)
      const review = reviews.find(item => item.AttendId === a.id && item.attendVersion === a.version)
      return {
        id: a.id,
        name: a.Student.name,
        original: sessionLabel(a.Calendar),
        originalUrl:
          '/cramschool/attend/courses/' +
          a.Calendar.CourseId +
          '/calendar/' +
          a.CalendarId +
          '/students#roster-' +
          a.StudentId,
        state: m?.state || '',
        label: STATES[m?.state] || '待管理員決定',
        version: m?.version ?? 0,
        targetId: m?.TargetCalendarId,
        target: m?.target && sessionLabel(m.target),
        corrected: a.status !== 'excused',
        billId: bill?.TuitionBillId,
        credit: bill
          ? '已列帳折抵'
          : review?.decision === 'approved'
            ? '已核准折抵'
            : review?.decision === 'rejected'
              ? '不予折抵'
              : '尚無折抵紀錄'
      }
    })
  }
}

async function update({ attendId, version, state, targetId, actorId }) {
  if (!Object.hasOwn(STATES, state) || !Number.isSafeInteger(version) || version < 0) return false
  return sequelize.transaction(async transaction => {
    const lock = { transaction, lock: transaction.LOCK.UPDATE }
    const a = await Attend.findByPk(attendId, lock)
    if (!a || (a.status !== 'excused' && state !== 'closed')) return false
    const current = await MakeupLesson.findOne({ where: { AttendId: attendId }, ...lock })
    if ((current?.version ?? 0) !== version || (!current && a.status !== 'excused')) return false
    let target = null
    if (state === 'scheduled' || state === 'completed') {
      const id = targetId || current?.TargetCalendarId
      if (!id || id === a.CalendarId) return false
      const dest = await Calendar.findByPk(id, lock)
      const original = await Calendar.findByPk(a.CalendarId, { transaction })
      if (!dest?.startAt || !original?.endAt || dest.startAt < original.endAt || dest.status === 'cancelled')
        return false
      if (
        state === 'completed' &&
        (current?.state !== 'scheduled' || id !== current.TargetCalendarId || dest.startAt > new Date())
      )
        return false
      if (state === 'scheduled' && dest.status !== 'scheduled') return false
      target = id
    }
    const data = { state, TargetCalendarId: target, version: version + 1, updatedBy: actorId }
    if (current) await current.update(data, { transaction })
    else await MakeupLesson.create({ ...data, AttendId: attendId }, { transaction })
    return true
  })
}
// 在目的課堂顯示核准的補課學生，保留原課堂的選課、點名及帳務資料。
async function getMakeupRoster(calendarId) {
  const rows = await MakeupLesson.findAll({
    where: { TargetCalendarId: calendarId, state: { [Op.in]: ['scheduled', 'completed'] } },
    include: [
      {
        model: Attend,
        required: true,
        where: { status: 'excused' },
        include: [{ model: Student, attributes: ['name', 'studentNo'] }]
      }
    ],
    order: [['id', 'ASC']],
    raw: true,
    nest: true
  })
  return rows.map(row => ({
    name: row.Attend.Student.name,
    studentNo: row.Attend.Student.studentNo,
    status: STATES[row.state],
    attendId: row.AttendId
  }))
}

async function getStudentMakeupIds(studentId, startAt, endAt) {
  const rows = await MakeupLesson.findAll({
    attributes: ['TargetCalendarId'],
    where: { state: { [Op.in]: ['scheduled', 'completed'] } },
    include: [
      { model: Attend, attributes: [], required: true, where: { StudentId: studentId, status: 'excused' } },
      {
        model: Calendar,
        as: 'target',
        required: true,
        attributes: [],
        where: { startAt: { [Op.lt]: endAt }, endAt: { [Op.gt]: startAt } }
      }
    ],
    raw: true
  })
  return new Set(rows.map(row => row.TargetCalendarId))
}

module.exports = { list, update, getMakeupRoster, getStudentMakeupIds }
