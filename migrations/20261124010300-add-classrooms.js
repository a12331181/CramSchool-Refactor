'use strict'
module.exports = {
  async up(q,S) {
    await q.createTable('Classrooms', { id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: S.STRING(80), allowNull: false, unique: true } })
    await q.addColumn('Calendars','ClassroomId',{ type: S.INTEGER, allowNull: true, references: { model: 'Classrooms', key: 'id' }, onDelete: 'RESTRICT' })
    await q.addIndex('Calendars',['ClassroomId','startAt','endAt'])
    await q.addIndex('Calendars',['startAt','endAt'])
  },
  async down(q) {
    await q.removeIndex('Calendars',['startAt','endAt'])
    await q.removeColumn('Calendars','ClassroomId')
    await q.dropTable('Classrooms')
  }
}
