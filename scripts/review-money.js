// 列出超過現行上限的歷史紀錄，供管理員依原始單據核對。
const { sequelize, Sequelize } = require('../models')
const { MAX_MONEY_AMOUNT } = require('../constants/money')

async function review() {
  const sources = {
    Courses: ['price'], ExtraFees: ['price'], TuitionBills: ['totalAmount'],
    TuitionBillItems: ['amount', 'unitPrice'], Payments: ['amount'],
    TuitionPaymentGroups: ['amount'], TuitionBillRefunds: ['amount'],
    TuitionPaymentAllocations: ['amount'], TuitionBillRefundAllocations: ['amount']
  }
  for (const [table, fields] of Object.entries(sources)) {
    const columns = fields.map(name => '`' + name + '`')
    const rows = await sequelize.query(
      'SELECT id, ' + columns.join(', ') + ' FROM `' + table + '` WHERE ' +
      columns.map(column => 'ABS(' + column + ') > :limit').join(' OR ') + ' ORDER BY id',
      { replacements: { limit: MAX_MONEY_AMOUNT }, type: Sequelize.QueryTypes.SELECT }
    )
    console.log(table + '　' + rows.length + ' 筆')
    for (const row of rows) console.log(JSON.stringify(row))
  }
}
review().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => sequelize.close())
