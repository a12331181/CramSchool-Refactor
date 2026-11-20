'use strict'

const {
  ensureUniqueReferenceColumn,
  backfillReferenceNumbers,
  referenceYearOrFallback,
  requireEmptyReferenceColumns
} = require('../database/migrationHelpers/referenceNumbers20261121')

const draftColumn = { table: 'TuitionBills', field: 'draftNo', length: 12, index: 'uq_tuition_bills_draft_no' }
const issuedColumn = { table: 'TuitionBills', field: 'billNo', length: 12, index: 'uq_tuition_bills_bill_no' }

module.exports = {
  async up(queryInterface, Sequelize) {
    await ensureUniqueReferenceColumn(queryInterface, draftColumn)
    await ensureUniqueReferenceColumn(queryInterface, issuedColumn)

    await queryInterface.sequelize.transaction(async transaction => {
      await backfillReferenceNumbers(queryInterface, Sequelize, transaction, {
        ...draftColumn, kind: 'draft', width: 4, dateColumn: 'createdAt',
        prefixOf: row => 'D' + referenceYearOrFallback(row) + '001', validPrefix: /^D\d{7}$/
      })
      await backfillReferenceNumbers(queryInterface, Sequelize, transaction, {
        ...issuedColumn, kind: 'bill', width: 4, dateColumn: 'issuedAt', onlyDated: true,
        prefixOf: row => 'B' + referenceYearOrFallback(row) + '001', validPrefix: /^B\d{7}$/
      })
    })
  },

  async down(queryInterface, Sequelize) {
    await requireEmptyReferenceColumns(queryInterface, Sequelize, [issuedColumn, draftColumn])
    const counters = await queryInterface.sequelize.query(
      "SELECT 1 FROM `ReferenceNumberCounters` WHERE (`scope` LIKE 'draft:%' OR `scope` LIKE 'bill:%') AND `lastNumber` > 0 LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT }
    )
    if (counters.length) throw new Error('Tuition number counters must be retained after numbers are assigned.')
    await queryInterface.removeColumn('TuitionBills', 'billNo')
    await queryInterface.removeColumn('TuitionBills', 'draftNo')
  }
}
