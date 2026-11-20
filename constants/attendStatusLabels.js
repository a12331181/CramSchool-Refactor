const ATTEND_STATUS = require('./attendStatus')

module.exports = Object.freeze({
  [ATTEND_STATUS.PRESENT]: '出席',
  [ATTEND_STATUS.ABSENT]: '缺席',
  [ATTEND_STATUS.EXCUSED]: '請假',
  [ATTEND_STATUS.UNMARKED]: '未點名'
})
