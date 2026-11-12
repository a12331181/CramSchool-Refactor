'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TuitionPaymentAllocations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      PaymentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Payments', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      },
      TuitionBillItemId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'TuitionBillItems', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      },
      amount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false }
    }, {
      engine: 'InnoDB',
      charset: 'utf8mb4',
      uniqueKeys: {
        uq_tuition_payment_bill_item: { fields: ['TuitionBillItemId'] }
      }
    })
  },

  async down(queryInterface, Sequelize) {
    const [row] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS total FROM `TuitionPaymentAllocations`',
      { type: Sequelize.QueryTypes.SELECT }
    )
    if (Number(row.total) > 0) throw new Error('已有分項收款紀錄，不能刪除收款分配資料表。')
    await queryInterface.dropTable('TuitionPaymentAllocations')
  }
}
