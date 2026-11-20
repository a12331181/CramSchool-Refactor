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
    courseNo: {
      type: DataTypes.CHAR(9),
      allowNull: true,
      unique: 'uq_courses_course_no',
      validate: { len: [9, 9], is: /^[A-Z]{2}\d{7}$/ }
    },
    name: DataTypes.STRING,
    time: DataTypes.STRING,
    type: DataTypes.STRING,
    price: DataTypes.INTEGER,
    TeacherId: DataTypes.INTEGER,
    isActive: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Course',
  });
  return Course;
};