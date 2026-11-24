'use strict'
module.exports = {
  async up(q, S) {
    await q.createTable('MakeupLessons', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      AttendId: {
        type: S.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'Attends', key: 'id' },
        onDelete: 'RESTRICT'
      },
      TargetCalendarId: {
        type: S.INTEGER,
        references: { model: 'Calendars', key: 'id' },
        onDelete: 'RESTRICT'
      },
      state: { type: S.STRING(12), allowNull: false },
      version: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      updatedBy: { type: S.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false }
    })
  },
  down(q) {
    return q.dropTable('MakeupLessons')
  }
}
