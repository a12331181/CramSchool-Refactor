'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SchoolSessions', {
      sid: { type: Sequelize.STRING(36), primaryKey: true },
      expires: { type: Sequelize.DATE, allowNull: true },
      data: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addIndex('SchoolSessions', ['expires'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('SchoolSessions')
  }
}
