'use strict'

const { Model } = require('sequelize')
const { MAX_GROUP_NOTE_LENGTH } = require('../constants/tuitionPayment')

module.exports = (sequelize, DataTypes) => {
  class TuitionPaymentGroup extends Model {
    static associate(models) {
      TuitionPaymentGroup.belongsTo(models.Student, {
        foreignKey: { name: 'StudentId', allowNull: false },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      })
    }
  }

  TuitionPaymentGroup.init({
    billingMonth: { type: DataTypes.CHAR(7), allowNull: false },
    studentNameSnapshot: { type: DataTypes.STRING(255), allowNull: false },
    paidOn: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    note: { type: DataTypes.STRING(MAX_GROUP_NOTE_LENGTH), allowNull: false, defaultValue: '' },
    requestKey: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
    requestDigest: { type: DataTypes.CHAR(64), allowNull: false }
  }, {
    sequelize,
    modelName: 'TuitionPaymentGroup',
    tableName: 'TuitionPaymentGroups',
    updatedAt: false
  })

  return TuitionPaymentGroup
}
