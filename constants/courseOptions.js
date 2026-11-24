const { MAX_MONEY_AMOUNT } = require('./money')

const COURSE_TIMES = Object.freeze({
  MINUTES_60: '60',
  MINUTES_90: '90',
  MINUTES_120: '120'
})

const COURSE_TYPES = Object.freeze({
  PER_LESSON: '依堂數計費',
  MONTHLY: '依月計費'
})

const COURSE_PRICING_FIELDS = Object.freeze(['id', 'courseNo', 'name', 'type', 'price'])
const MAX_COURSE_PRICE = MAX_MONEY_AMOUNT

module.exports = {
  COURSE_TIMES,
  COURSE_TYPES,
  COURSE_PRICING_FIELDS,
  MAX_COURSE_PRICE
}