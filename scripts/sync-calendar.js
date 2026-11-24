const { synchronize } = require('../services/googleCalendarService')
const { sequelize } = require('../models')

async function main() {
  if (process.env.GOOGLE_CALENDAR_SYNC !== '1') {
    console.log('Google 日曆同步尚未啟用。')
    return
  }
  const result = await synchronize({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    namespace: process.env.GOOGLE_CALENDAR_NAMESPACE
  })
  console.log(
    result.busy
      ? '已有同步作業正在執行。'
      : '已更新 ' + result.updated + ' 堂，內容相同 ' + result.unchanged + ' 堂。'
  )
}
main()
  .catch(error => {
    console.error(
      '日曆同步未完成。請核對授權、網路和日曆設定後重試。',
      error.response?.status || error.code || ''
    )
    process.exitCode = 1
  })
  .finally(() => sequelize.close())
