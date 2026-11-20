const { randomBytes, timingSafeEqual } = require('node:crypto')

function createSessionFormToken() {
  return randomBytes(32).toString('hex')
}

function isValidSessionFormToken(submitted, expected) {
  const isToken = value =>
    typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value)

  return isToken(submitted) && isToken(expected) &&
    timingSafeEqual(Buffer.from(submitted, 'hex'), Buffer.from(expected, 'hex'))
}

module.exports = { createSessionFormToken, isValidSessionFormToken }
