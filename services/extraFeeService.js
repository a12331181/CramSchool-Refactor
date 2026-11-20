const { ExtraFee } = require('../models')

function getExtraFees() {
  return ExtraFee.findAll({ raw: true })
}

function getExtraFeeDetails(extraFeeId) {
  return ExtraFee.findByPk(extraFeeId, { raw: true })
}

function createExtraFee({ name, price }) {
  return ExtraFee.create({ name, price })
}

async function updateExtraFee(extraFeeId, { name, price }) {
  const extraFee = await ExtraFee.findByPk(extraFeeId)
  if (!extraFee) return false

  await extraFee.update({ name, price })
  return true
}

module.exports = { getExtraFees, getExtraFeeDetails, createExtraFee, updateExtraFee }
