module.exports = (sequelize, DataTypes) => sequelize.define('Classroom', {
  name: { type: DataTypes.STRING(80), allowNull: false, unique: true }
}, { timestamps: false })
