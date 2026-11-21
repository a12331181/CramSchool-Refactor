const { randomBytes } = require('node:crypto')

function getSessionSecret({ NODE_ENV, SESSION_SECRET } = process.env) {
  const secret = SESSION_SECRET?.trim()
  if (!secret && NODE_ENV !== 'production') return randomBytes(32).toString('hex')

  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('SESSION_SECRET must contain a securely generated secret of at least 32 bytes.')
  }
  return secret
}

module.exports = { getSessionSecret }
