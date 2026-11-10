'use strict'

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class TuitionBillItem extends Model {
    static associate(models) {
      TuitionBillItem.belongsTo(models.TuitionBill, {
        foreignKey: 'TuitionBillId',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      TuitionBillItem.belongsTo(models.Course, {
        foreignKey: 'CourseId',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      TuitionBillItem.belongsTo(models.ExtraFee, {
        foreignKey: 'ExtraFeeId',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      })
    }
  }
  
  TuitionBillItem.init({
    TuitionBillId: { type: DataTypes.INTEGER, allowNull: false },
    CourseId: { type: DataTypes.INTEGER, allowNull: true },
    ExtraFeeId: { type: DataTypes.INTEGER, allowNull: true },
    kind: { type: DataTypes.STRING(24), allowNull: false },
    descriptionSnapshot: { type: DataTypes.STRING(255), allowNull: false },
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    unitPrice: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    ActiveLeaveAttendId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true
    },
    sourceSnapshot: { type: DataTypes.JSON, allowNull: true }
  }, {
    sequelize,
    modelName: 'TuitionBillItem',
    tableName: 'TuitionBillItems'
  })

  return TuitionBillItem
}