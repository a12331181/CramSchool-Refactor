'use strict';

const { Model } = require('sequelize');
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')

module.exports = (sequelize, DataTypes) => {
  class Student extends Model {
    static associate(models) {
      Student.belongsToMany(models.Course, {
        through: {
          model: models.Enrollment,
          unique: false,
          scope: {
            status: ENROLLMENT_STATUS.ACTIVE
          }
        },
        foreignKey: 'StudentId',
        otherKey: 'CourseId',
        as: 'EnrolledCourses'
      })
      Student.hasMany(models.Attend)
      Student.hasMany(models.Tuition)
    }
  };
  Student.init({
    name: DataTypes.STRING,
    sex: DataTypes.STRING,
    birth: DataTypes.STRING,
    school: DataTypes.STRING,
    grade: DataTypes.STRING,
    tel: DataTypes.STRING,
    address: DataTypes.STRING,
    image: DataTypes.STRING,
    status: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'Student',
  });
  return Student;
};