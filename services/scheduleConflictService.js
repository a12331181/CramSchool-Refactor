const { createHash } = require('node:crypto')
const { Op } = require('sequelize')
const { Enrollment, Calendar, Student, Course } = require('../models')
const { getTaipeiDate, formatTaipeiDateTime } = require('../utils/date')
const { getCandidateEnrollmentWhere, getConfirmedSessionEnrollment } = require('./courseSessionEnrollmentRules')
const STATUS = require('../constants/courseSessionStatus')

function groupByStudent(rows) {
  const group = new Map()
  for (const row of rows) {
    if (!group.has(row.StudentId)) group.set(row.StudentId, [])
    group.get(row.StudentId).push(row)
  }
  return group
}

async function findStudentConflicts(courseId, slots, transaction) {
  const results = []
  for (const slot of slots) {
    const overlaps = await Calendar.findAll({
      attributes: ['id','CourseId','startAt','endAt'], include: [{ model: Course, attributes: ['name'] }],
      where: { CourseId: { [Op.ne]: courseId }, startAt: { [Op.lt]: slot.endAt },
        endAt: { [Op.gt]: slot.startAt }, status: { [Op.in]: [STATUS.SCHEDULED, STATUS.COMPLETED] } },
      order: [['id','ASC']], raw: true, nest: true, transaction
    })
    if (!overlaps.length) continue
    const ours = groupByStudent(await Enrollment.findAll({ where: { CourseId: courseId,
      ...getCandidateEnrollmentWhere(getTaipeiDate(slot.startAt)) }, raw: true, transaction }))
    const studentIds = [...ours].filter(([, rows]) => getConfirmedSessionEnrollment(rows)).map(([id]) => id)
    if (!studentIds.length) continue
    for (const other of overlaps) {
      const theirs = groupByStudent(await Enrollment.findAll({ where: { CourseId: other.CourseId,
        StudentId: { [Op.in]: studentIds }, ...getCandidateEnrollmentWhere(getTaipeiDate(other.startAt)) },
        order: [['StudentId','ASC']], raw: true, transaction }))
      for (const [id, rows] of theirs) if (getConfirmedSessionEnrollment(rows)) {
        results.push({ studentId: id, calendarId: other.id, course: other.Course.name, start: formatTaipeiDateTime(other.startAt),
          end: formatTaipeiDateTime(other.endAt), requested: formatTaipeiDateTime(slot.startAt) })
      }
    }
  }
  if (!results.length) return null
  const students = await Student.findAll({ attributes: ['id','name'], where: { id: [...new Set(results.map(row => row.studentId))] }, raw: true, transaction })
  const names = new Map(students.map(row => [row.id,row.name]))
  const key = createHash('sha256').update(JSON.stringify(results)).digest('hex')
  return { key, conflicts: results.map(row => ({ ...row, name: names.get(row.studentId) })) }
}
module.exports = { findStudentConflicts }
