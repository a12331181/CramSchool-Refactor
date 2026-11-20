'use strict'

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  // Only used to prevent deletion of students or courses with historical charges.
  class LegacyTuition extends Model {}

  LegacyTuition.init({
    CourseId: DataTypes.INTEGER,
    StudentId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'LegacyTuition',
    tableName: 'Tuitions',
    timestamps: false
  })

  return LegacyTuition
}
