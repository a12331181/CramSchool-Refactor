'use strict';

const CALENDAR_STATUS = require('../constants/calendarStatus')

const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Calendar extends Model {
    static associate(models) {
      Calendar.belongsTo(models.Course)
      Calendar.hasMany(models.Attend)
      Calendar.belongsTo(models.Teacher, {
        foreignKey: 'TeacherId'
      })
    }
  };
  Calendar.init({
    date: DataTypes.STRING,
    content: DataTypes.TEXT,
    CourseId: DataTypes.INTEGER,
    period: DataTypes.INTEGER,
    isActive: DataTypes.BOOLEAN,
    startAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: true,
      validate: {
        isIn: [Object.values(CALENDAR_STATUS)]
      }
    },
    TeacherId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        isInt: true,
        min: 1
      }
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        isInt: true,
        min: 0
      }
    }
  }, {
    sequelize,
    modelName: 'Calendar',
  });
  return Calendar;
};