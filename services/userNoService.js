const { User, UserNoCounter, sequelize } = require('../models')
const { Op } = require('sequelize')
const { getTaipeiDate } = require('../utils/date')

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

module.exports = { assignUserNo }