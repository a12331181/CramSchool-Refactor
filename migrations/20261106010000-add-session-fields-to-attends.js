'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Attends\`
        ADD COLUMN \`status\` VARCHAR(16) NULL,
        ADD COLUMN \`EnrollmentId\` INT NULL,
        ADD COLUMN \`recordedBy\` INT NULL,
        ADD COLUMN \`version\` INT NULL
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Attends\`
        DROP COLUMN \`version\`,
        DROP COLUMN \`recordedBy\`,
        DROP COLUMN \`EnrollmentId\`,
        DROP COLUMN \`status\`
    `)
  }
}