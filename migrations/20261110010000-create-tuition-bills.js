'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TuitionBills', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      StudentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Students', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      billingMonth: { type: Sequelize.CHAR(7), allowNull: false },
      studentNameSnapshot: { type: Sequelize.STRING(255), allowNull: false },
      currency: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'TWD' },
      status: {
        type: Sequelize.ENUM('draft', 'issued', 'void'),
        allowNull: false,
        defaultValue: 'draft'
      },
      totalAmount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      issuedAt: { type: Sequelize.DATE, allowNull: true },
      activeMarker: {
        type: "TINYINT GENERATED ALWAYS AS (CASE WHEN `status` = 'void' THEN NULL ELSE 1 END) STORED"
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    }, {
      engine: 'InnoDB',
      charset: 'utf8mb4',
      uniqueKeys: {
        uq_tuition_bills_active_month: {
          fields: ['StudentId', 'billingMonth', 'activeMarker']
        }
      }
    })
  },

  async down(queryInterface, Sequelize) {
    const [row] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS total FROM `TuitionBills`',
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (Number(row.total) > 0) {
      throw new Error('TuitionBills contains bills; refusing to drop the table.')
    }

    await queryInterface.dropTable('TuitionBills')
  }
}