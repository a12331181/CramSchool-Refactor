'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`AuditLogs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`actorId\` INT NOT NULL,
        \`entityType\` VARCHAR(32) NOT NULL,
        \`entityId\` INT NOT NULL,
        \`action\` VARCHAR(32) NOT NULL,
        \`before\` JSON NULL,
        \`after\` JSON NULL,
        \`reason\` VARCHAR(255) NULL,
        \`occurredAt\` DATETIME NOT NULL,
        \`requestId\` VARCHAR(64) NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_auditlogs_entity\` (\`entityType\`, \`entityId\`, \`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id FROM `AuditLogs` LIMIT 1'
    )

    if (rows.length > 0) {
      throw new Error('AuditLogs 已有操作紀錄，請先確認歷史資料的保留方式。')
    }

    await queryInterface.dropTable('AuditLogs')
  }
}