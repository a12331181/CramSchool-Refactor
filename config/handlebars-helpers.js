const { formatReferenceLabel } = require('../utils/referenceLabel')

module.exports = {
  referenceLabel: formatReferenceLabel,
  initial: value => Array.from(String(value ?? '').trim())[0] ?? '・',
  ifCond: function (a, b, options) {
    if (a === b) {
      return options.fn(this)
      }
    return options.inverse(this)
  }
}