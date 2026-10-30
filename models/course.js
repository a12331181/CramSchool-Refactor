'use strict';

const { Model } = require('sequelize');
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')

module.exports = (sequelize, DataTypes) => {
  class Course extends Model {
    static associate(models) {
      Course.belongsTo(models.Teacher)
      Course.belongsToMany(models.Student, {
        through: {
          model: models.Enrollment,
          unique: false,
          scope: {
            status: ENROLLMENT_STATUS.ACTIVE
          }
        },
        foreignKey: 'CourseId',
        otherKey: 'StudentId',
        as: 'EnrolledStudents'
      })
      Course.hasMany(models.Calendar)
      Course.hasMany(models.Diary)
      Course.hasMany(models.Tuition)
    }
  };
  Course.init({
    name: DataTypes.STRING,
    time: DataTypes.STRING,
    type: DataTypes.STRING,
    amounts: DataTypes.INTEGER,
    price: DataTypes.INTEGER,
    TeacherId: DataTypes.INTEGER,
    isActive: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Course',
  });
  return Course;
};