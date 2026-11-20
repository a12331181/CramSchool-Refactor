'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TuitionBillRefundAllocations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      TuitionBillRefundId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'TuitionBillRefunds', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      },
      TuitionPaymentAllocationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'TuitionPaymentAllocations', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      },
      amount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false }
    }, {
      engine: 'InnoDB',
      charset: 'utf8mb4',
      uniqueKeys: {
        uq_tuition_refund_payment_allocation: { fields: ['TuitionBillRefundId', 'TuitionPaymentAllocationId'] }
      }
    })
  },

  async down(queryInterface, Sequelize) {
    const rows = await queryInterface.sequelize.query(
      'SELECT `id` FROM `TuitionBillRefundAllocations` LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    )
    if (rows.length > 0) throw new Error('已有分項退費紀錄，不能刪除退費分配資料表。')
    await queryInterface.dropTable('TuitionBillRefundAllocations')
  }
}
