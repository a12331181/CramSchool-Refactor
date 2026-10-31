'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Calendars\`
        ADD COLUMN \`startAt\` DATETIME NULL,
        ADD COLUMN \`endAt\` DATETIME NULL,
        ADD COLUMN \`status\` VARCHAR(16) NULL,
        ADD COLUMN \`TeacherId\` INT NULL,
        ADD COLUMN \`version\` INT NOT NULL DEFAULT 0
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Calendars\`
        DROP COLUMN \`version\`,
        DROP COLUMN \`TeacherId\`,
        DROP COLUMN \`status\`,
        DROP COLUMN \`endAt\`,
        DROP COLUMN \`startAt\`
    `)
  }
}