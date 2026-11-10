'use strict'

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class TuitionBill extends Model {
    static associate(models) {
      TuitionBill.belongsTo(models.Student, {
        foreignKey: 'StudentId',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      TuitionBill.hasMany(models.TuitionBillItem, {
        as: 'items',
        foreignKey: 'TuitionBillId',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })
    }
  }

  TuitionBill.init({
    StudentId: { type: DataTypes.INTEGER, allowNull: false },
    billingMonth: { type: DataTypes.CHAR(7), allowNull: false },
    studentNameSnapshot: { type: DataTypes.STRING(255), allowNull: false },
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'TWD' },
    status: {
      type: DataTypes.ENUM('draft', 'issued', 'void'),
      allowNull: false,
      defaultValue: 'draft'
    },
    totalAmount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    issuedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'TuitionBill',
    tableName: 'TuitionBills'
  })

  return TuitionBill
}