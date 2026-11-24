module.exports = (sequelize, S) => {
  const MakeupLesson = sequelize.define('MakeupLesson', {
    AttendId: { type: S.INTEGER, allowNull: false, unique: true },
    TargetCalendarId: S.INTEGER, state: { type: S.STRING(12), allowNull: false },
    version: { type: S.INTEGER, allowNull: false, defaultValue: 0 }, updatedBy: { type: S.INTEGER, allowNull: false }
  })
  MakeupLesson.associate = models => {
    MakeupLesson.belongsTo(models.Calendar, { as: 'target', foreignKey: 'TargetCalendarId' })
    models.Attend.hasOne(MakeupLesson, { foreignKey: 'AttendId' })
  }
  return MakeupLesson
}
