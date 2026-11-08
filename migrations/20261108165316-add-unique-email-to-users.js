'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('Users', ['email'], {
      name: 'uq_users_email',
      unique: true
    })
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Users', 'uq_users_email')
  }
}