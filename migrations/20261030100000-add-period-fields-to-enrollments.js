'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Enrollments\`
        ADD COLUMN \`startsOn\` DATE NULL,
        ADD COLUMN \`endsOn\` DATE NULL,
        ADD COLUMN \`status\` VARCHAR(10) NOT NULL DEFAULT 'active'
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Enrollments\`
        DROP COLUMN \`status\`,
        DROP COLUMN \`endsOn\`,
        DROP COLUMN \`startsOn\`
    `)
  }
}