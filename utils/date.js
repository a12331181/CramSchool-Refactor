const taipeiDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const taipeiTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

function getTaipeiDate(date = new Date()) {
  const parts = Object.fromEntries(
    taipeiDateFormatter.formatToParts(date)
      .map(({ type, value }) => [type, value])
  )

  return `${parts.year}-${parts.month}-${parts.day}`
}

function formatTaipeiDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null
  }

  const parts = Object.fromEntries(
    taipeiTimeFormatter.formatToParts(date)
      .map(({ type, value }) => [type, value])
  )

  return `${getTaipeiDate(date)} ${parts.hour}:${parts.minute}`
}

function parseTaipeiDateTime(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  ) {
    return null
  }

  const date = new Date(`${value}:00+08:00`)

  if (formatTaipeiDateTime(date) !== value.replace('T', ' ')) {
    return null
  }

  return date
}

module.exports = { 
  getTaipeiDate,
  formatTaipeiDateTime,
  parseTaipeiDateTime
}
