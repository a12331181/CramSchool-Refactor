const bcrypt = require('bcryptjs')
const { Op, Validator, UniqueConstraintError } = require('sequelize')
const { User, UserNoCounter, Teacher, sequelize } = require('../models')
const TEACHER_STATUS = require('../constants/teacherStatus')
const { getTaipeiDate } = require('../utils/date')

async function signUp({ name, email, password, realName, phone } = {}) {
  const requiredText = [name, email, realName]

  if (
    requiredText.some(value =>
      typeof value !== 'string' ||
      value.trim() === '' ||
      value.trim().length > 255
    ) ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    return { ok: false, code: 'INVALID_INPUT' }
  }

  const normalizedEmail = email.trim()

  if (!Validator.isEmail(normalizedEmail, {
    allow_utf8_local_part: false
  })) {
    return { ok: false, code: 'INVALID_EMAIL' }
  }

  if (typeof phone !== 'string') {
    return { ok: false, code: 'INVALID_PHONE' }
  }

  const normalizedPhone = phone.trim()

  if (
    normalizedPhone.length !== 10 ||
    !/^09[0-9]{8}$/.test(normalizedPhone)
  ) {
    return { ok: false, code: 'INVALID_PHONE' }
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    return { ok: false, code: 'PASSWORD_TOO_LONG' }
  }

  const existingUser = await User.findOne({
    attributes: ['id'],
    where: { email: normalizedEmail }
  })

  if (existingUser) {
    return { ok: false, code: 'EMAIL_EXISTS' }
  }

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    return await sequelize.transaction(async transaction => {
      const user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: passwordHash,
        isAdmin: false
      }, { transaction })

      const { userNo } = await assignUserNo({
        userId: user.id,
        schoolCode: '001',
        transaction
      })

      await Teacher.create({
        name: realName.trim(),
        phone: normalizedPhone,
        UserId: user.id,
        status: TEACHER_STATUS.ACTIVE
      }, { transaction })

      return { ok: true, userId: user.id, userNo }
    })
  } catch (error) {
    if (
      error instanceof UniqueConstraintError &&
      Object.hasOwn(error.fields ?? {}, 'email')
    ) {
      return { ok: false, code: 'EMAIL_EXISTS' }
    }

    throw error
  }
}

async function assignUserNo({ userId, schoolCode, transaction } = {}) {
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new Error('帳號 ID 必須是正整數')
  }

  const year = Number(getTaipeiDate().slice(0, 4))

  await UserNoCounter.build({ year, schoolCode }).validate()

  const assign = async currentTransaction => {
    const locked = {
      transaction: currentTransaction,
      lock: currentTransaction.LOCK.UPDATE
    }

    const user = await User.findByPk(userId, {
      ...locked,
      attributes: ['id', 'userNo']
    })

    if (!user) throw new Error('找不到指定帳號')

    if (user.userNo != null) {
      await user.validate({ fields: ['userNo'] })
      return { userNo: user.userNo, assigned: false }
    }

    await sequelize.query(
      'INSERT INTO UserNoCounters (year, schoolCode, lastNumber) ' +
      'VALUES (:year, :schoolCode, 0) ' +
      'ON DUPLICATE KEY UPDATE lastNumber = lastNumber',
      {
        replacements: { year, schoolCode },
        transaction: currentTransaction
      }
    )

    const counter = await UserNoCounter.findOne({
      ...locked,
      where: { year, schoolCode }
    })

    if (!counter) throw new Error('找不到發號計數資料')

    await counter.validate()

    const prefix = String(year) + schoolCode
    const largestUserNo = await User.max('userNo', {
      where: { userNo: { [Op.like]: prefix + '%' } },
      transaction: currentTransaction
    })

    if (largestUserNo != null) {
      await User.build({ userNo: largestUserNo })
        .validate({ fields: ['userNo'] })
    }

    const largestNumber = largestUserNo == null
      ? 0
      : Number(largestUserNo.slice(-3))

    const lastNumber = Math.max(counter.lastNumber, largestNumber)

    if (lastNumber >= 999) {
      throw new Error('這個年度與補習班的帳號流水號已用完')
    }

    const nextNumber = lastNumber + 1
    const userNo = prefix + String(nextNumber).padStart(3, '0')

    await counter.update(
      { lastNumber: nextNumber },
      { transaction: currentTransaction }
    )

    await user.update(
      { userNo },
      { transaction: currentTransaction }
    )

    return { userNo, assigned: true }
  }

  return transaction
    ? assign(transaction)
    : sequelize.transaction(assign)
}

module.exports = { 
  signUp,
  assignUserNo
}