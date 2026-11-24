'use strict'

// 同一校區只有一份正式課表，鎖定這列可讓兩位管理員排不同班時也看見彼此的新課。
module.exports = {
  async up(q, S) {
    await q.createTable('ScheduleWrites', { id: { type: S.INTEGER, primaryKey: true } })
    await q.bulkInsert('ScheduleWrites', [{ id: 1 }])
  },
  down(q) {
    return q.dropTable('ScheduleWrites')
  }
}
