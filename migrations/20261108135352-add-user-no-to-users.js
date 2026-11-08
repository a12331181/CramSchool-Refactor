'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE Users ' +
      'ADD COLUMN userNo CHAR(10) NULL, ' +
      'ADD UNIQUE INDEX uq_users_user_no (userNo)'
    )
  },

  async down(queryInterface, Sequelize) {
    const assignedUsers = await queryInterface.sequelize.query(
      'SELECT id FROM Users WHERE userNo IS NOT NULL LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (assignedUsers.length > 0) {
      throw new Error(
        '已有帳號取得 userNo，請先確認資料保留方式，再移除欄位。'
      )
    }

    await queryInterface.sequelize.query(
      'ALTER TABLE Users ' +
      'DROP INDEX uq_users_user_no, ' +
      'DROP COLUMN userNo'
    )
  }
}