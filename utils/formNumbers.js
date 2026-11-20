function readUnsignedInteger(value) {
  return typeof value === 'string' && value !== '' && !/\D/.test(value) ? Number(value) : NaN
}

module.exports = { readUnsignedInteger }
