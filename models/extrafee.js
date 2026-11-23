'use strict';
const { parseExtraFeePrice } = require('../utils/extraFeePrice')
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ExtraFee extends Model {}
  ExtraFee.init({
    name: DataTypes.STRING,
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { validPrice(value) { parseExtraFeePrice(value) } }
    }
  }, {
    sequelize,
    modelName: 'ExtraFee',
  });
  return ExtraFee;
};