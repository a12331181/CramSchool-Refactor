'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TuitionBillRefunds', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      TuitionBillId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'TuitionBills', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
      },
      amount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      refundedOn: { type: Sequelize.DATEONLY, allowNull: false },
      reason: { type: Sequelize.STRING(255), allowNull: false },
      actorId: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false }
    }, { engine: 'InnoDB', charset: 'utf8mb4' })
  },

  async down(queryInterface, Sequelize) {
    const [row] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS total FROM `TuitionBillRefunds`',
      { type: Sequelize.QueryTypes.SELECT }
    )
    if (Number(row.total) > 0) throw new Error('退費紀錄已存在，不能刪除退費資料表。')
    await queryInterface.dropTable('TuitionBillRefunds')
  }
}
