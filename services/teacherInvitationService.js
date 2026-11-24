const { createHash, randomBytes } = require('node:crypto')
const { Transaction, Validator } = require('sequelize')
const { TeacherInvitation, User, sequelize } = require('../models')

const { INVITATION_HOURS } = require('../constants/teacherInvitation')

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function createTeacherInvitation({ email, actorId }) {
  const address = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (address.length > 254 || !Validator.isEmail(address, { allow_utf8_local_part: false })) {
    return { ok: false, code: 'INVALID_EMAIL' }
  }

  return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
    const admin = await User.findOne({
      where: { id: actorId, isAdmin: true }, attributes: ['id'], transaction, lock: transaction.LOCK.SHARE
    })
    if (!admin) return { ok: false, code: 'FORBIDDEN' }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + INVITATION_HOURS * 60 * 60 * 1000)
    // Reissuing and consuming both lock the invitation for this email before checking the account.
    await TeacherInvitation.upsert({
      email: address, tokenHash: hashToken(token), expiresAt, createdByUserId: actorId
    }, { transaction })
    const existing = await User.findOne({ where: { email: address }, attributes: ['id'], transaction })
    if (existing) {
      await TeacherInvitation.destroy({ where: { email: address }, transaction })
      return { ok: false, code: 'EMAIL_EXISTS' }
    }
    return { ok: true, token, email: address, expiresAt }
  })
}

async function getActiveInvitation(token, { email, transaction } = {}) {
  if (typeof token !== 'string' || token.length !== 64 || /[^0-9a-f]/.test(token)) return null
  const tokenHash = hashToken(token)
  const invite = transaction
    ? await TeacherInvitation.findByPk(email, { transaction, lock: transaction.LOCK.UPDATE })
    : await TeacherInvitation.findOne({ where: { tokenHash } })
  if (!invite || invite.tokenHash !== tokenHash || invite.expiresAt.getTime() <= Date.now()) return null
  return invite
}

module.exports = { createTeacherInvitation, getActiveInvitation }
