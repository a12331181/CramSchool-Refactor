'use strict'

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class UserNoCounter extends Model {}

  UserNoCounter.init({
    year: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      validate: { isInt: true, min: 1000, max: 9999 }
    },
    schoolCode: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      primaryKey: true,
      validate: {
        isValidSchoolCode(value) {
          if (
            typeof value !== 'string' ||
            value.length !== 3 ||
            !/^[0-9]{3}$/.test(value)
          ) {
            throw new Error('補習班代碼必須是 3 碼數字字串')
          }
        }
      }
    },
    lastNumber: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      validate: { isInt: true, min: 0, max: 999 }
    }
  }, {
    sequelize,
    modelName: 'UserNoCounter',
    tableName: 'UserNoCounters',
    timestamps: false
  })

  return UserNoCounter
}