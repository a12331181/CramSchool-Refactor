const { formatReferenceLabel } = require('../utils/referenceLabel')

module.exports = {
  referenceLabel: formatReferenceLabel,
  ifCond: function (a, b, options) {
    if (a === b) {
      return options.fn(this)
      }
    return options.inverse(this)
  }
}