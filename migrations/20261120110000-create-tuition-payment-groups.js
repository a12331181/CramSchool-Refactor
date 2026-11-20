'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query([
      'CREATE TABLE IF NOT EXISTS `TuitionPaymentGroups` (',
      '  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,',
      '  `StudentId` INT NOT NULL,',
      '  `billingMonth` CHAR(7) NOT NULL,',
      '  `studentNameSnapshot` VARCHAR(255) NOT NULL,',
      '  `paidOn` DATE NOT NULL,',
      '  `amount` INT NOT NULL,',
      "  `note` VARCHAR(255) NOT NULL DEFAULT '',",
      '  `requestKey` CHAR(36) NOT NULL,',
      '  `requestDigest` CHAR(64) NOT NULL,',
      '  `createdAt` DATETIME NOT NULL,',
      '  UNIQUE KEY `uq_tuition_payment_group_request` (`requestKey`),',
      '  KEY `idx_tuition_payment_group_paid_on` (`paidOn`),',
      '  CONSTRAINT `fk_tuition_payment_group_student` FOREIGN KEY (`StudentId`)',
      '    REFERENCES `Students` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    ].join(' '))
    await queryInterface.sequelize.query([
      'ALTER TABLE `Payments`',
      'ADD COLUMN `TuitionPaymentGroupId` INT NULL,',
      'ADD UNIQUE KEY `uq_tuition_payment_group_bill` (`TuitionPaymentGroupId`, `TuitionBillId`),',
      'ADD CONSTRAINT `fk_payment_tuition_payment_group` FOREIGN KEY (`TuitionPaymentGroupId`)',
      'REFERENCES `TuitionPaymentGroups` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT'
    ].join(' '))
  },

  async down(queryInterface, Sequelize) {
    const [row] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS total FROM `TuitionPaymentGroups`',
      { type: Sequelize.QueryTypes.SELECT }
    )
    if (Number(row.total) > 0) throw new Error('已有合併收款紀錄，不能移除匯款與帳單間的對應。')

    await queryInterface.sequelize.query([
      'ALTER TABLE `Payments`',
      'DROP FOREIGN KEY `fk_payment_tuition_payment_group`,',
      'DROP INDEX `uq_tuition_payment_group_bill`,',
      'DROP COLUMN `TuitionPaymentGroupId`'
    ].join(' '))
    await queryInterface.dropTable('TuitionPaymentGroups')
  }
}
