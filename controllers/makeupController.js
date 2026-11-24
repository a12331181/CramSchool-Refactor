const makeup = require('../services/makeupService')
const { getTaipeiDate, isTaipeiDateKey } = require('../utils/date')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')
const { sendPageError } = require('../utils/pageError')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')

async function list(req,res) {
  const date = req.query.date ?? getTaipeiDate()
  const page = getPageOffset(req.query.page,DIRECTORY_PAGE_SIZE)
  const id = req.query.attendId
  if (!isTaipeiDateKey(date) || !page || (id !== undefined && !/^[1-9]\d*$/.test(id))) return sendPageError(res,400,'請核對補課日期與頁碼。')
  const data = await makeup.list({ offset:page.offset, limit:DIRECTORY_PAGE_SIZE, attendId:id, date })
  const pageUrl = n => '/cramschool/makeups?' + new URLSearchParams({ date,page:n,...(id && { attendId:id }) })
  const pagination = getPagination({ page:page.page, pageSize:DIRECTORY_PAGE_SIZE, totalCount:data.count })
  if (page.page > pagination.totalPages) return res.redirect(pageUrl(pagination.totalPages))
  return res.render('school/makeups',{ ...data,date,attendId:id,...getPaginationLinks(pagination,pageUrl) })
}
async function update(req,res) {
  const b = req.body
  if (!/^[1-9]\d*$/.test(req.params.id) || !/^\d+$/.test(b.version) || (b.targetId && !/^[1-9]\d*$/.test(b.targetId))) return sendPageError(res,400,'補課資料格式不正確。')
  const ok = await makeup.update({ attendId:Number(req.params.id),version:Number(b.version),state:b.state,targetId:Number(b.targetId)||null,actorId:req.user.id })
  if (!ok) return sendPageError(res,409,'無法變更補課，請核對最新點名、目的課堂與補課狀態。')
  return res.redirect(303,'/cramschool/makeups?attendId='+req.params.id + (isTaipeiDateKey(b.date) ? '&date='+b.date : ''))
}
module.exports = { list, update }
