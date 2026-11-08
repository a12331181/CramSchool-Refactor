'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('UserNoCounters', {
      year: {
        type: Sequelize.SMALLINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      schoolCode: {
        type: Sequelize.CHAR(3),
        allowNull: false,
        primaryKey: true
      },
      lastNumber: {
        type: Sequelize.SMALLINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      }
    }, {
      engine: 'InnoDB'
    })
  },

  async down(queryInterface, Sequelize) {
    const counters = await queryInterface.sequelize.query(
      'SELECT 1 FROM UserNoCounters LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (counters.length > 0) {
      throw new Error(
        '已有發號狀態，請先確認編號保留方式，再移除計數表。'
      )
    }

    await queryInterface.dropTable('UserNoCounters')
  }
}