const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class TeacherInvitation extends Model {}

  TeacherInvitation.init({
    email: { type: DataTypes.STRING(254), primaryKey: true, allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: false }
  }, { sequelize, modelName: 'TeacherInvitation' })

  return TeacherInvitation
}
