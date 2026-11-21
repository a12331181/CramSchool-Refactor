const { Op } = require('sequelize')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')

function getCandidateEnrollmentWhere(sessionDate) {
  // Missing dates are candidates for review. The end date is exclusive.
  return {
    status: { [Op.in]: [ENROLLMENT_STATUS.ACTIVE, ENROLLMENT_STATUS.ENDED] },
    [Op.and]: [
      { [Op.or]: [{ startsOn: null }, { startsOn: { [Op.lte]: sessionDate } }] },
      { [Op.or]: [{ endsOn: null }, { endsOn: { [Op.gt]: sessionDate } }] }
    ]
  }
}

function isConfirmedSessionEnrollment({ startsOn, endsOn, status }) {
  return startsOn != null && (
    status === ENROLLMENT_STATUS.ACTIVE ||
    (status === ENROLLMENT_STATUS.ENDED && endsOn != null)
  )
}

function getConfirmedSessionEnrollment(candidates) {
  return candidates.length === 1 && isConfirmedSessionEnrollment(candidates[0])
    ? candidates[0]
    : null
}

module.exports = { getCandidateEnrollmentWhere, isConfirmedSessionEnrollment, getConfirmedSessionEnrollment }
