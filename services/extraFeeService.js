const { ExtraFee } = require('../models')
const { parseExtraFeePrice } = require('../utils/extraFeePrice')

function getExtraFees() {
  return ExtraFee.findAll({ raw: true })
}

function getExtraFeeDetails(extraFeeId) {
  return ExtraFee.findByPk(extraFeeId, { raw: true })
}

function createExtraFee({ name, price }) {
  return ExtraFee.create({ name, price: parseExtraFeePrice(price) })
}

async function updateExtraFee(extraFeeId, { name, price }) {
  const extraFee = await ExtraFee.findByPk(extraFeeId)
  if (!extraFee) return false

  await extraFee.update({ name, price: parseExtraFeePrice(price) })
  return true
}

module.exports = { getExtraFees, getExtraFeeDetails, createExtraFee, updateExtraFee }
