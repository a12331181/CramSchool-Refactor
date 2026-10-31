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

module.exports = { 
  getTaipeiDate,
  formatTaipeiDateTime
}
