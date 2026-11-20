// This helper is pinned to the 2026-11-21 migrations; keep their numbering rules stable.
async function ensureUniqueReferenceColumn(queryInterface, { table, field, length, index }) {
  const cols = await queryInterface.describeTable(table)
  if (!cols[field]) {
    await queryInterface.sequelize.query(
      `ALTER TABLE \`${table}\` ADD COLUMN \`${field}\` CHAR(${length}) NULL, ` +
      `ADD UNIQUE KEY \`${index}\` (\`${field}\`)`
    )
  }
  const indexes = await queryInterface.showIndex(table)
  const installed = indexes.some(item => item.unique && item.fields.length === 1 && item.fields[0].attribute === field)
  if (!installed) throw new Error(`${table}.${field} has no unique index; stop before assigning numbers.`)
}

async function backfillReferenceNumbers(queryInterface, Sequelize, transaction, {
  table, field, kind, width, prefixOf, validPrefix, dateColumn = null, onlyDated = false
}) {
  const connection = queryInterface.sequelize
  const dateProjection = dateColumn === null ? '' : `, YEAR(DATE_ADD(\`${dateColumn}\`, INTERVAL 8 HOUR)) AS referenceYear`
  const where = onlyDated ? ` WHERE \`${dateColumn}\` IS NOT NULL` : ''
  const rows = await connection.query(
    `SELECT \`id\`, \`${field}\`${dateProjection} FROM \`${table}\`${where} ORDER BY \`id\` FOR UPDATE`,
    { transaction, type: Sequelize.QueryTypes.SELECT }
  )
  const counters = await connection.query(
    'SELECT `scope`, `lastNumber` FROM `ReferenceNumberCounters` WHERE `scope` LIKE :scope FOR UPDATE',
    { transaction, replacements: { scope: kind + ':%' }, type: Sequelize.QueryTypes.SELECT }
  )
  const highWater = new Map(counters.map(row => [row.scope, Number(row.lastNumber)]))
  const register = (prefix, number) => {
    if (!validPrefix.test(prefix) || !Number.isSafeInteger(number) || number < 1 || number >= 10 ** width) {
      throw new Error(`Invalid or exhausted sequence for ${table}.${field}.`)
    }
    const key = kind + ':' + prefix
    highWater.set(key, Math.max(highWater.get(key) ?? 0, number))
  }

  // Preserve existing identifiers and sequence history on a retry or a partially numbered database.
  for (const row of rows) {
    if (row[field] == null) continue
    const code = String(row[field])
    const suffix = code.slice(-width)
    if (!/^\d+$/.test(suffix)) throw new Error(`Invalid existing ${field}.`)
    register(code.slice(0, -width), Number(suffix))
  }
  for (const row of rows) {
    if (row[field] != null) continue
    const prefix = prefixOf(row)
    const next = (highWater.get(kind + ':' + prefix) ?? 0) + 1
    register(prefix, next)
    await queryInterface.bulkUpdate(
      table, { [field]: prefix + String(next).padStart(width, '0') }, { id: row.id }, { transaction }
    )
  }
  for (const [scope, lastNumber] of highWater) {
    await connection.query(
      'INSERT INTO `ReferenceNumberCounters` (`scope`, `lastNumber`) VALUES (:scope, :lastNumber) ' +
      'ON DUPLICATE KEY UPDATE `lastNumber` = GREATEST(`lastNumber`, :lastNumber)',
      { transaction, replacements: { scope, lastNumber } }
    )
  }
}

function referenceYearOrFallback(row) {
  return Number.isInteger(Number(row.referenceYear)) && Number(row.referenceYear) >= 1000 && Number(row.referenceYear) <= 9999
    ? String(row.referenceYear)
    : '2026'
}

async function requireEmptyReferenceColumns(queryInterface, Sequelize, columns) {
  for (const { table, field } of columns) {
    const rows = await queryInterface.sequelize.query(
      `SELECT 1 FROM \`${table}\` WHERE \`${field}\` IS NOT NULL LIMIT 1`,
      { type: Sequelize.QueryTypes.SELECT }
    )
    if (rows.length) throw new Error(`${table}.${field} already contains assigned numbers; refusing to erase them.`)
  }
}

module.exports = { ensureUniqueReferenceColumn, backfillReferenceNumbers, referenceYearOrFallback, requireEmptyReferenceColumns }
