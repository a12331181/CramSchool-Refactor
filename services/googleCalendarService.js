// 將課堂異動單向送至校方指定的日曆，保存同步狀態以供重試。

const { createHash } = require('node:crypto')

const { GoogleAuth } = require('google-auth-library')
const { Op } = require('sequelize')

const { sequelize, Calendar, CalendarExport, Course, Classroom } = require('../models')

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function googleClient(calendarId) {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/calendar.events'] })
  const base =
    'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events'
  return async (method, id, data) =>
    auth.request({
      url: base + (id ? '/' + id : ''),
      method,
      data,
      params: { sendUpdates: 'none' },
      timeout: 15000,
      retry: false
    })
}

function status(error) {
  return error.response?.status ?? error.code
}

async function publish(request, id, event) {
  if (!event) {
    try {
      await request('DELETE', id)
    } catch (error) {
      if (![404, 410].includes(status(error))) throw error
    }
    return
  }
  try {
    await request('PUT', id, event)
  } catch (error) {
    if (![404, 410].includes(status(error))) throw error
    try {
      await request('POST', null, { ...event, id })
    } catch (insertError) {
      if (status(insertError) !== 409) throw insertError
      await request('PUT', id, event)
    }
  }
}

async function synchronize({ calendarId, namespace, request = googleClient(calendarId) }) {
  if (!calendarId || !namespace) throw Error('請設定 Google 日曆與校方識別碼。')
  const destination = digest(namespace + '\n' + calendarId)
  const conn = await sequelize.connectionManager.getConnection({ type: 'WRITE' })
  const lock = 'school_gcal_' + destination.slice(0, 48)
  const [acquired] = await conn.promise().query('SELECT GET_LOCK(?,0) AS ok', [lock])
  if (!acquired[0].ok) {
    await sequelize.connectionManager.releaseConnection(conn)
    return { busy: true, updated: 0, unchanged: 0 }
  }
  let last = 0,
    updated = 0,
    unchanged = 0
  try {
    while (true) {
      const sessions = await Calendar.findAll({
        where: { id: { [Op.gt]: last }, startAt: { [Op.ne]: null }, endAt: { [Op.ne]: null } },
        include: [Course, Classroom],
        order: [['id', 'ASC']],
        limit: 100
      })
      if (!sessions.length) break
      for (const session of sessions) {
        last = session.id
        if (!['scheduled', 'completed', 'cancelled'].includes(session.status)) continue
        let link = await CalendarExport.findOne({ where: { destination, CalendarId: last } })
        const cancelled = session.status === 'cancelled'
        if (cancelled && !link) continue
        const event = cancelled
          ? null
          : {
              summary: session.Course.name,
              location: session.Classroom?.name || '',
              start: { dateTime: session.startAt.toISOString(), timeZone: 'Asia/Taipei' },
              end: { dateTime: session.endAt.toISOString(), timeZone: 'Asia/Taipei' }
            }
        const fingerprint = digest(JSON.stringify(event))
        if (link?.fingerprint === fingerprint) {
          unchanged++
          continue
        }
        if (!link)
          link = await CalendarExport.create({
            destination,
            CalendarId: last,
            eventId: digest(destination + '#' + last)
          })
        await publish(request, link.eventId, event)
        await link.update({ fingerprint })
        updated++
      }
    }
    return { updated, unchanged }
  } finally {
    try {
      await conn.promise().query('SELECT RELEASE_LOCK(?)', [lock])
    } finally {
      await sequelize.connectionManager.releaseConnection(conn)
    }
  }
}
module.exports = { synchronize }
