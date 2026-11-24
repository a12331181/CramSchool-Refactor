'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Meeting extends Model {
    static associate(models) {
      Meeting.belongsTo(models.Teacher)
    }
  };
  Meeting.init({
    date: DataTypes.STRING,
    richText: DataTypes.BOOLEAN,
    subject: DataTypes.STRING,
    content: DataTypes.TEXT,
    TeacherId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Meeting',
  });
  return Meeting;
};