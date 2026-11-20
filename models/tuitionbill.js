'use strict'

const { Model } = require('sequelize')
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')

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
    draftNo: {
      type: DataTypes.CHAR(12), allowNull: true, unique: 'uq_tuition_bills_draft_no',
      validate: { len: [12, 12], is: /^D\d{11}$/ }
    },
    billNo: {
      type: DataTypes.CHAR(12), allowNull: true, unique: 'uq_tuition_bills_bill_no',
      validate: { len: [12, 12], is: /^B\d{11}$/ }
    },
    StudentId: { type: DataTypes.INTEGER, allowNull: false },
    SupplementCourseId: { type: DataTypes.INTEGER, allowNull: true },
    billingMonth: { type: DataTypes.CHAR(7), allowNull: false },
    studentNameSnapshot: { type: DataTypes.STRING(255), allowNull: false },
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'TWD' },
    status: {
      type: DataTypes.ENUM(TUITION_BILL_STATUS.DRAFT, TUITION_BILL_STATUS.ISSUED, TUITION_BILL_STATUS.VOID),
      allowNull: false,
      defaultValue: TUITION_BILL_STATUS.DRAFT
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