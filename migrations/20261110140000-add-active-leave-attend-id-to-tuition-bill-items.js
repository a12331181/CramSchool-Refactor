'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('TuitionBillItems', 'ActiveLeaveAttendId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'Attends', key: 'id' },
      onDelete: 'RESTRICT'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('TuitionBillItems', 'ActiveLeaveAttendId')
  }
}