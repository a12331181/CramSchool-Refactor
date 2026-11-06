'use strict'

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface

    const [missingIds] = await sequelize.query(`
      SELECT id
      FROM \`Attends\`
      WHERE CalendarId IS NULL OR StudentId IS NULL
      LIMIT 1
    `)

    if (missingIds.length > 0) {
      throw new Error('Attends 有缺少課堂 ID 或學生 ID 的紀錄，請先核對。')
    }

    const [duplicates] = await sequelize.query(`
      SELECT CalendarId, StudentId
      FROM \`Attends\`
      GROUP BY CalendarId, StudentId
      HAVING COUNT(*) > 1
      LIMIT 1
    `)

    if (duplicates.length > 0) {
      throw new Error('Attends 有重複的課堂與學生組合，請先核對。')
    }

    await sequelize.query(`
      ALTER TABLE \`Attends\`
        MODIFY COLUMN \`CalendarId\` INT NOT NULL,
        MODIFY COLUMN \`StudentId\` INT NOT NULL,
        ADD UNIQUE KEY \`uq_attends_calendar_student\` (\`CalendarId\`, \`StudentId\`),
        ALGORITHM=INPLACE
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Attends\`
        DROP INDEX \`uq_attends_calendar_student\`,
        MODIFY COLUMN \`CalendarId\` INT NULL,
        MODIFY COLUMN \`StudentId\` INT NULL
    `)
  }
}