'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TeacherInvitations', {
      email: { type: Sequelize.STRING(254), primaryKey: true, allowNull: false },
      tokenHash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      createdByUserId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('TeacherInvitations')
  }
}
