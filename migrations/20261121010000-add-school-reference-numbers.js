'use strict'

const {
  ensureUniqueReferenceColumn,
  backfillReferenceNumbers,
  referenceYearOrFallback,
  requireEmptyReferenceColumns
} = require('../database/migrationHelpers/referenceNumbers20261121')

const courseColumn = { table: 'Courses', field: 'courseNo', length: 9, index: 'uq_courses_course_no' }
const studentColumn = { table: 'Students', field: 'studentNo', length: 11, index: 'uq_students_student_no' }

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ReferenceNumberCounters', {
      scope: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      lastNumber: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }
    }, { engine: 'InnoDB', charset: 'utf8mb4' })
    await ensureUniqueReferenceColumn(queryInterface, courseColumn)
    await ensureUniqueReferenceColumn(queryInterface, studentColumn)

    // The original database belongs to school 001. Old courses have no assigned subject prefix.
    await queryInterface.sequelize.transaction(async transaction => {
      await backfillReferenceNumbers(queryInterface, Sequelize, transaction, {
        ...courseColumn, kind: 'course', width: 4, prefixOf: () => 'CR001', validPrefix: /^[A-Z]{2}\d{3}$/
      })
      await backfillReferenceNumbers(queryInterface, Sequelize, transaction, {
        ...studentColumn, kind: 'student', width: 3, dateColumn: 'createdAt',
        prefixOf: row => 'S' + referenceYearOrFallback(row) + '001', validPrefix: /^S\d{7}$/
      })
    })
  },

  async down(queryInterface, Sequelize) {
    await requireEmptyReferenceColumns(queryInterface, Sequelize, [courseColumn, studentColumn])
    const counters = await queryInterface.sequelize.query(
      'SELECT 1 FROM `ReferenceNumberCounters` WHERE `lastNumber` > 0 LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    )
    if (counters.length) throw new Error('Number counters must be kept even if the original records were removed.')
    await queryInterface.removeColumn('Courses', 'courseNo')
    await queryInterface.removeColumn('Students', 'studentNo')
    await queryInterface.dropTable('ReferenceNumberCounters')
  }
}
