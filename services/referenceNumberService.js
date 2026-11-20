const { QueryTypes } = require('sequelize')
const SCHOOL_CODE = require('../constants/schoolCode')
const { COURSE_SEQUENCE_WIDTH, STUDENT_SEQUENCE_WIDTH } = require('../constants/referenceNumbers')
const { getTaipeiDate } = require('../utils/date')

class ReferenceNumberExhaustedError extends Error {}

async function allocateReferenceNumber({ kind, prefix, width }, transaction) {
  const sequelize = transaction?.sequelize
  if (!sequelize) throw new TypeError('Number allocation must use the record creation transaction.')

  const scope = `${kind}:${prefix}`
  if (scope.length > 32 || !/^[a-z]+:[A-Z0-9]+$/.test(scope) || ![3, 4].includes(width)) {
    throw new TypeError('Invalid reference number scope.')
  }

  const options = { transaction, replacements: { scope } }
  await sequelize.query(
    'INSERT INTO `ReferenceNumberCounters` (`scope`, `lastNumber`) VALUES (:scope, 0) ' +
    'ON DUPLICATE KEY UPDATE `lastNumber` = `lastNumber`',
    options
  )
  const [counter] = await sequelize.query(
    'SELECT `lastNumber` FROM `ReferenceNumberCounters` WHERE `scope` = :scope FOR UPDATE',
    { ...options, type: QueryTypes.SELECT }
  )
  const lastNumber = Number(counter?.lastNumber)
  if (!Number.isSafeInteger(lastNumber) || lastNumber < 0) throw new Error('Invalid reference number counter.')
  if (lastNumber >= 10 ** width - 1) throw new ReferenceNumberExhaustedError('此類編號的流水號已用完。')

  const next = lastNumber + 1
  await sequelize.query(
    'UPDATE `ReferenceNumberCounters` SET `lastNumber` = :next WHERE `scope` = :scope',
    { transaction, replacements: { scope, next } }
  )
  return prefix + String(next).padStart(width, '0')
}

function allocateCourseNo(coursePrefix, transaction) {
  return allocateReferenceNumber({ kind: 'course', prefix: coursePrefix + SCHOOL_CODE, width: COURSE_SEQUENCE_WIDTH }, transaction)
}

function allocateStudentNo(transaction) {
  const year = getTaipeiDate().slice(0, 4)
  return allocateReferenceNumber({ kind: 'student', prefix: 'S' + year + SCHOOL_CODE, width: STUDENT_SEQUENCE_WIDTH }, transaction)
}

module.exports = { ReferenceNumberExhaustedError, allocateReferenceNumber, allocateCourseNo, allocateStudentNo }
