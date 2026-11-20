const COURSE_SESSION_STATUS = require('./courseSessionStatus')

module.exports = Object.freeze({
  [COURSE_SESSION_STATUS.SCHEDULED]: '已排定',
  [COURSE_SESSION_STATUS.COMPLETED]: '已完成',
  [COURSE_SESSION_STATUS.CANCELLED]: '已取消'
})
