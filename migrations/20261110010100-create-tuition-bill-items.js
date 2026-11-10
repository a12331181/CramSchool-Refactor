'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TuitionBillItems', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      TuitionBillId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'TuitionBills', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      CourseId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Courses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      ExtraFeeId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'ExtraFees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      kind: { type: Sequelize.STRING(24), allowNull: false },
      descriptionSnapshot: { type: Sequelize.STRING(255), allowNull: false },
      quantity: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      unitPrice: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      amount: { type: Sequelize.INTEGER, allowNull: false },
      reason: { type: Sequelize.STRING(255), allowNull: true },
      sourceSnapshot: { type: Sequelize.JSON, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    }, {
      engine: 'InnoDB',
      charset: 'utf8mb4'
    })
  },

  async down(queryInterface, Sequelize) {
    const [row] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS total FROM `TuitionBillItems`',
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (Number(row.total) > 0) {
      throw new Error('TuitionBillItems contains items; refusing to drop the table.')
    }

    await queryInterface.dropTable('TuitionBillItems')
  }
}