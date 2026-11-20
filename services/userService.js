const bcrypt = require('bcryptjs')
const { Op, Validator, UniqueConstraintError } = require('sequelize')
const { User, UserNoCounter, Teacher, Course, sequelize } = require('../models')
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

const TEACHER_PROFILE_FIELDS = ['name', 'sex', 'birth', 'phone', 'address', 'education', 'school']

async function getTeacherProfile(userId) {
  const teacher = await Teacher.findOne({
    attributes: ['id', 'image', ...TEACHER_PROFILE_FIELDS],
    where: { UserId: userId, status: TEACHER_STATUS.ACTIVE },
    include: [
      { model: User, attributes: ['id', 'email'] },
      { model: Course, attributes: ['id', 'name', 'isActive'] }
    ]
  })
  if (!teacher) return null

  const { Courses: courses, ...profile } = teacher.toJSON()
  return { teacher: profile, courses }
}

function getEditableTeacherProfile(userId) {
  return User.findByPk(userId, {
    attributes: ['id'],
    include: [{ model: Teacher, attributes: ['id', ...TEACHER_PROFILE_FIELDS], required: true }],
    raw: true,
    nest: true
  })
}

async function updateTeacherProfile(userId, body, imageUrl) {
  const teacher = await Teacher.findOne({ where: { UserId: userId } })
  if (!teacher) return false

  const updates = Object.fromEntries(
    TEACHER_PROFILE_FIELDS.filter(key => body[key] !== undefined).map(key => [key, body[key]])
  )
  if (imageUrl !== undefined) updates.image = imageUrl
  await teacher.update(updates)
  return true
}

function getAdminUserList() {
  return User.findAll({
    attributes: ['id', 'name', 'email', 'isAdmin'],
    order: [['id', 'ASC']],
    raw: true
  })
}

async function toggleUserAdmin(userId) {
  const user = await User.findByPk(userId)
  if (!user) return false

  await user.update({ isAdmin: !user.isAdmin })
  return true
}

module.exports = {
  getAdminUserList,
  toggleUserAdmin,
  getTeacherProfile,
  getEditableTeacherProfile,
  updateTeacherProfile,
  signUp,
  assignUserNo
}