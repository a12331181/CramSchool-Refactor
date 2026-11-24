'use strict'

module.exports = {
  async up(q, S) {
    for (const table of ['Diaries', 'Meetings']) {
      await q.addColumn(table, 'richText', { type: S.BOOLEAN, allowNull: false, defaultValue: false })
    }
    await q.createTable('RecordAttachments', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      DiaryId: { type: S.INTEGER, references: { model: 'Diaries', key: 'id' }, onDelete: 'CASCADE' },
      MeetingId: { type: S.INTEGER, references: { model: 'Meetings', key: 'id' }, onDelete: 'CASCADE' },
      name: { type: S.STRING(180), allowNull: false }, mime: { type: S.STRING(100), allowNull: false },
      data: { type: S.BLOB('medium'), allowNull: false }
    })
    await q.sequelize.query('ALTER TABLE RecordAttachments ADD CONSTRAINT ck_record_owner CHECK ((DiaryId IS NULL) <> (MeetingId IS NULL))')
  },
  async down(q) {
    await q.dropTable('RecordAttachments')
    for (const table of ['Meetings', 'Diaries']) await q.removeColumn(table, 'richText')
  }
}
