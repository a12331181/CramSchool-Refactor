// 呈現管理員補課清單，接收補課安排與完成決定。

const responses = require('../constants/messages/makeup')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')

const makeup = require('../services/makeupService')

const { getTaipeiDate, isTaipeiDateKey } = require('../utils/date')
const { sendPageError } = require('../utils/pageError')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')

async function list(req, res) {
  const date = req.query.date ?? getTaipeiDate()
  const page = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)
  const id = req.query.attendId
  if (!isTaipeiDateKey(date) || !page || (id !== undefined && !/^[1-9]\d*$/.test(id)))
    return sendPageError(res, 400, responses.listInvalidPageDate)
  const data = await makeup.list({ offset: page.offset, limit: DIRECTORY_PAGE_SIZE, attendId: id, date })
  const pageUrl = n =>
    '/cramschool/makeups?' + new URLSearchParams({ date, page: n, ...(id && { attendId: id }) })
  const pagination = getPagination({ page: page.page, pageSize: DIRECTORY_PAGE_SIZE, totalCount: data.count })
  if (page.page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))
  return res.render('school/makeups', {
    ...data,
    date,
    attendId: id,
    ...getPaginationLinks(pagination, pageUrl)
  })
}
async function update(req, res) {
  const b = req.body
  if (
    !/^[1-9]\d*$/.test(req.params.id) ||
    !/^\d+$/.test(b.version) ||
    (b.targetId && !/^[1-9]\d*$/.test(b.targetId))
  )
    return sendPageError(res, 400, responses.updateInvalidProfile)
  const ok = await makeup.update({
    attendId: Number(req.params.id),
    version: Number(b.version),
    state: b.state,
    targetId: Number(b.targetId) || null,
    actorId: req.user.id
  })
  if (!ok) return sendPageError(res, 409, responses.updateUnavailableSessionAttendanceStatus)
  return res.redirect(
    303,
    '/cramschool/makeups?attendId=' + req.params.id + (isTaipeiDateKey(b.date) ? '&date=' + b.date : '')
  )
}
module.exports = { list, update }
