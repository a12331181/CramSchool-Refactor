const { Meeting, Teacher } = require('../models')

function getRecentMeetings(limit) {
  return Meeting.findAll({
    raw: true,
    nest: true,
    limit,
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  })
}

function getMeetingsPage({ offset, limit }) {
  return Meeting.findAndCountAll({
    raw: true,
    nest: true,
    offset,
    limit,
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  })
}

function getMeetingDetails(meetingId) {
  return Meeting.findByPk(meetingId, { raw: true, nest: true, include: [Teacher] })
}

function getMeetingAuthor(userId) {
  return Teacher.findOne({ raw: true, where: { UserId: userId } })
}

async function createMeeting({ userId, date, subject, content }) {
  const teacher = await getMeetingAuthor(userId)
  if (!teacher) return false

  await Meeting.create({ date, subject, content, TeacherId: teacher.id })
  return true
}

async function deleteMeeting(meetingId) {
  const meeting = await Meeting.findByPk(meetingId)
  if (!meeting) return false

  await meeting.destroy()
  return true
}

module.exports = { getRecentMeetings, getMeetingsPage, getMeetingDetails, getMeetingAuthor, createMeeting, deleteMeeting }
