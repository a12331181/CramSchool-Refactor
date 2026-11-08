'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasOne(models.Teacher)
    }
  };
  User.init({
    userNo: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      unique: 'uq_users_user_no',
      validate: {
        isValidUserNo(value) {
          if (value == null) return

          if (
            typeof value !== 'string' ||
            value.length !== 10 ||
            !/^[0-9]{10}$/.test(value)
          ) {
            throw new Error('帳號編號必須是 10 碼數字字串')
          }
        }
      }
    },
    name: DataTypes.STRING,
    email: {
      type: DataTypes.STRING,
      unique: 'uq_users_email'
    },
    password: DataTypes.STRING,
    isAdmin: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'User',
  });
  return User;
};