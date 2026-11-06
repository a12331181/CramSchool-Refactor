'use strict';

const ATTEND_STATUS = require('../constants/attendStatus')
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Attend extends Model {
    static associate(models) {
      Attend.belongsTo(models.Student)
      Attend.belongsTo(models.Calendar)
    }
  };
  Attend.init({
    CalendarId: DataTypes.INTEGER,
    StudentId: DataTypes.INTEGER,
    isAttend: DataTypes.BOOLEAN,
    reason: DataTypes.STRING,
    status: {
      type: DataTypes.STRING(16),
      allowNull: true,
      validate: {
        isIn: [Object.values(ATTEND_STATUS)]
      }
    },
    EnrollmentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { isInt: true, min: 1 }
    },
    recordedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { isInt: true, min: 1 }
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { isInt: true, min: 0 }
    }
  });
  return Attend;
};