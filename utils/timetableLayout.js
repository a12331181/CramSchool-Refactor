// 將同一天的課堂位置換算成分鐘，重疊時在同一時段並排顯示。
const { parseTaipeiDateTime } = require('./date')

function layoutTimetable(columns) {
  let firstHour = 9, lastHour = 18
  const groups = columns.map(column => {
    const midnight = parseTaipeiDateTime(column.date + 'T00:00').getTime()
    const rows = column.rows.map(row => {
      const from = Math.max(0, (row.startAt.getTime() - midnight) / 60000)
      const until = Math.min(1440, (row.endAt.getTime() - midnight) / 60000)
      firstHour = Math.min(firstHour, Math.floor(from / 60))
      lastHour = Math.max(lastHour, Math.ceil(until / 60))
      return { ...row, from, until }
    }).sort((a,b) => a.from - b.from || a.until - b.until || a.id - b.id)
    let cluster = [], ends = []
    function closeCluster() {
      for (const row of cluster) {
        row.leftPercent = row.lane / ends.length * 100
        row.widthPercent = 100 / ends.length
      }
      cluster = []; ends = []
    }
    for (const row of rows) {
      if (cluster.length && ends.every(end => end <= row.from)) closeCluster()
      let lane = ends.findIndex(end => end <= row.from)
      if (lane < 0) lane = ends.length
      ends[lane] = row.until
      row.lane = lane
      cluster.push(row)
    }
    closeCluster()
    return { ...column, rows }
  })
  const hours = Array.from({ length:lastHour-firstHour }, (_,index) => String(firstHour+index).padStart(2,'0') + ':00')
  for (const column of groups) for (const row of column.rows) {
    row.offset = row.from - firstHour * 60
    row.duration = row.until - row.from
  }
  return { columns:groups, hours }
}
module.exports = { layoutTimetable }
