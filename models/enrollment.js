'use strict'

const { Model } = require('sequelize')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')

module.exports = (sequelize, DataTypes) => {
  class Enrollment extends Model {}

  Enrollment.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    StudentId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    CourseId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    startsOn: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    endsOn: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    status: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: ENROLLMENT_STATUS.ACTIVE,
      validate: {
        isIn: [Object.values(ENROLLMENT_STATUS)]
      }
    }
  }, {
    sequelize,
    modelName: 'Enrollment'
  })

  return Enrollment
}
