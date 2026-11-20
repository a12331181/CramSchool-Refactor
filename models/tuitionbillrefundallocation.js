'use strict'

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class TuitionBillRefundAllocation extends Model {
    static associate(models) {
      TuitionBillRefundAllocation.belongsTo(models.TuitionBillRefund, {
        foreignKey: { name: 'TuitionBillRefundId', allowNull: false },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      })
      TuitionBillRefundAllocation.belongsTo(models.TuitionPaymentAllocation, {
        foreignKey: { name: 'TuitionPaymentAllocationId', allowNull: false },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      })
    }
  }

  TuitionBillRefundAllocation.init({
    amount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
  }, {
    sequelize,
    modelName: 'TuitionBillRefundAllocation',
    tableName: 'TuitionBillRefundAllocations',
    timestamps: false
  })

  return TuitionBillRefundAllocation
}
