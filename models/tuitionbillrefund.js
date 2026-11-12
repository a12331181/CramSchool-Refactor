'use strict'

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class TuitionBillRefund extends Model {
    static associate(models) {
      TuitionBillRefund.belongsTo(models.TuitionBill, {
        foreignKey: { name: 'TuitionBillId', allowNull: false },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      })
    }
  }

  TuitionBillRefund.init({
    amount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    refundedOn: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: false },
    actorId: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    sequelize,
    modelName: 'TuitionBillRefund',
    tableName: 'TuitionBillRefunds',
    updatedAt: false
  })

  return TuitionBillRefund
}
