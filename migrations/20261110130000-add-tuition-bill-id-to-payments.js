'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const { id } = await queryInterface.describeTable('TuitionBills')
    const billIdType = id?.type?.trim() ?? ''

    if (!/^(?:INT|INTEGER)(?:\(\d+\))?(?:\s+UNSIGNED)?$/i.test(billIdType)) {
      throw new Error('無法確認 TuitionBills.id 的整數型別：' + (billIdType || 'unknown'))
    }

    const isUnsigned = /\bUNSIGNED\b/i.test(billIdType)

    await queryInterface.addColumn('Payments', 'TuitionBillId', {
      type: isUnsigned ? Sequelize.INTEGER.UNSIGNED : Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'TuitionBills', key: 'id' },
      onDelete: 'RESTRICT'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Payments', 'TuitionBillId')
  }
}