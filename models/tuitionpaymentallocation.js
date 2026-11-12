'use strict'

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class TuitionPaymentAllocation extends Model {
    static associate(models) {
      TuitionPaymentAllocation.belongsTo(models.Payment, {
        foreignKey: { name: 'PaymentId', allowNull: false },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      })
      TuitionPaymentAllocation.belongsTo(models.TuitionBillItem, {
        foreignKey: { name: 'TuitionBillItemId', allowNull: false },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      })
    }
  }

  TuitionPaymentAllocation.init({
    amount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
  }, {
    sequelize,
    modelName: 'TuitionPaymentAllocation',
    tableName: 'TuitionPaymentAllocations',
    timestamps: false
  })

  return TuitionPaymentAllocation
}
