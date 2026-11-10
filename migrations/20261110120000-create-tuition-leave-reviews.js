'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TuitionLeaveReviews', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      AttendId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Attends', key: 'id' },
        onDelete: 'RESTRICT'
      },
      attendVersion: { type: Sequelize.INTEGER, allowNull: false },
      decision: { type: Sequelize.ENUM('approved', 'rejected'), allowNull: false },
      reason: { type: Sequelize.STRING(255), allowNull: false },
      reviewedBy: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false }
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('TuitionLeaveReviews')
  }
}