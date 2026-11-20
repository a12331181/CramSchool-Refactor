const moment = require('moment')
const { formatReferenceLabel } = require('../utils/referenceLabel')

module.exports = {
  referenceLabel: formatReferenceLabel,
  moment: function (a) {
    return moment(a).fromNow()
  },
  
  currentTime: function (a) {
    return moment(a).format('YYYY-MM-DD')
  },

  ifCond: function (a, b, options) {
    if (a === b) {
      return options.fn(this)
      }
    return options.inverse(this)
  }
}