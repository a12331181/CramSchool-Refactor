'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Diary extends Model {
    static associate(models) {
      Diary.belongsTo(models.Teacher)
      Diary.belongsTo(models.Course)
    }
  };
  Diary.init({
    date: DataTypes.STRING,
    richText: DataTypes.BOOLEAN,
    subject: DataTypes.STRING,
    content: DataTypes.TEXT,
    TeacherId: DataTypes.INTEGER,
    CourseId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Diary',
  });
  return Diary;
};