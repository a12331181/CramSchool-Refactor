// 管理登入帳號資料、註冊交易與使用者權限。

const bcrypt = require('bcryptjs')
const { Op, Transaction, Validator, UniqueConstraintError } = require('sequelize')

const { User, UserNoCounter, Teacher, Course, sequelize } = require('../models')

const { TEACHER_PROFILE_FIELDS } = require('../constants/profileOptions')
const SCHOOL_CODE = require('../constants/schoolCode')
const TEACHER_STATUS = require('../constants/teacherStatus')

const { discardUnusedProfileImage } = require('./profileImageService')
const { getActiveInvitation } = require('./teacherInvitationService')

const { getTaipeiDate } = require('../utils/date')

async function signUp({ name, email, password, realName, phone, inviteToken } = {}) {
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

  const normalizedEmail = email.trim().toLowerCase()

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

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    return await sequelize.transaction(async transaction => {
      const invite = await getActiveInvitation(inviteToken, { email: normalizedEmail, transaction })
      if (!invite) return { ok: false, code: 'INVALID_INVITATION' }

      const user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: passwordHash,
        isAdmin: false
      }, { transaction })

      const { userNo } = await assignUserNo({
        userId: user.id,
        schoolCode: SCHOOL_CODE,
        transaction
      })

      await Teacher.create({
        name: realName.trim(),
        phone: normalizedPhone,
        UserId: user.id,
        status: TEACHER_STATUS.ACTIVE
      }, { transaction })

      await invite.destroy({ transaction })
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


async function getTeacherProfile(userId) {
  const teacher = await Teacher.findOne({
    attributes: ['id', 'image', ...TEACHER_PROFILE_FIELDS],
    where: { UserId: userId, status: TEACHER_STATUS.ACTIVE },
    include: [
      { model: User, attributes: ['id', 'email', 'userNo'] },
      { model: Course, attributes: ['id', 'courseNo', 'name'], where: { isActive: true }, required: false }
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
  let previousImage
  const updated = await sequelize.transaction(async transaction => {
    const teacher = await Teacher.findOne({
      where: { UserId: userId }, transaction, lock: transaction.LOCK.UPDATE
    })
    if (!teacher) return false

    const updates = Object.fromEntries(
      TEACHER_PROFILE_FIELDS.filter(key => body[key] !== undefined).map(key => [key, body[key]])
    )
    if (imageUrl !== undefined && imageUrl !== teacher.image) {
      previousImage = teacher.image
      updates.image = imageUrl
    }
    await teacher.update(updates, { transaction })
    return true
  })
  if (updated) await discardUnusedProfileImage(previousImage)
  return updated
}

function getAdminUserList() {
  return User.findAll({
    attributes: ['id', 'name', 'email', 'isAdmin'],
    order: [['id', 'ASC']],
    raw: true
  })
}

async function setUserAdmin({ userId, actorId, isAdmin }) {
  return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
    // Use the same lock order for promotions and demotions, including simultaneous requests.
    const users = await User.findAll({
      attributes: ['id', 'isAdmin'],
      where: { [Op.or]: [{ isAdmin: true }, { id: { [Op.in]: [actorId, userId] } }] },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!users.some(user => user.id === actorId && user.isAdmin)) return { ok: false, code: 'FORBIDDEN' }
    const target = users.find(user => user.id === userId)
    if (!target) return { ok: false, code: 'USER_NOT_FOUND' }

    if (target.isAdmin === isAdmin) return { ok: true }
    if (!isAdmin && !users.some(user => user.id !== userId && user.isAdmin)) {
      return { ok: false, code: 'LAST_ADMIN' }
    }
    await target.update({ isAdmin }, { transaction })
    return { ok: true }
  })
}

module.exports = {
  getAdminUserList,
  setUserAdmin,
  getTeacherProfile,
  getEditableTeacherProfile,
  updateTeacherProfile,
  signUp,
  assignUserNo
}
