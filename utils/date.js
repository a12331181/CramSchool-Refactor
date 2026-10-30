const taipeiDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

function getTaipeiDate(date = new Date()) {
  const parts = Object.fromEntries(
    taipeiDateFormatter.formatToParts(date)
      .map(({ type, value }) => [type, value])
  )

  return `${parts.year}-${parts.month}-${parts.day}`
}

module.exports = { getTaipeiDate }
