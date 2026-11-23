const { readUnsignedInteger } = require('./formNumbers')

const MAX_EXTRA_FEE_PRICE = 10_000

class InvalidExtraFeePrice extends Error {
  constructor() {
    super(`額外費用必須是 1 到 ${MAX_EXTRA_FEE_PRICE} 元的整數。`)
  }
}

function parseExtraFeePrice(value) {
  const price = typeof value === 'number' ? value : readUnsignedInteger(value)
  if (!Number.isSafeInteger(price) || price < 1 || price > MAX_EXTRA_FEE_PRICE) {
    throw new InvalidExtraFeePrice()
  }
  return price
}

module.exports = { MAX_EXTRA_FEE_PRICE, InvalidExtraFeePrice, parseExtraFeePrice }
