module.exports = (sequelize, DataTypes) => sequelize.define('RecordAttachment', {
  DiaryId: DataTypes.INTEGER, MeetingId: DataTypes.INTEGER, name: DataTypes.STRING(180),
  mime: DataTypes.STRING(100), data: DataTypes.BLOB('medium')
}, { timestamps: false, defaultScope: { attributes: { exclude: ['data'] } } })
