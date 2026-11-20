'use strict'

module.exports = {
  async up(queryInterface) {
    // Keep the existing unique index. Slot 0 reserves the primary invoice;
    // each course may have one supplemental draft and any number of issued additions.
    await queryInterface.sequelize.query(`
      ALTER TABLE \`TuitionBills\`
        ADD COLUMN \`SupplementCourseId\` INT NULL,
        MODIFY COLUMN \`activeMarker\` INT GENERATED ALWAYS AS (
          CASE
            WHEN \`status\` = 'void' THEN NULL
            WHEN \`SupplementCourseId\` IS NULL THEN 0
            WHEN \`status\` = 'draft' THEN \`SupplementCourseId\`
            ELSE NULL
          END
        ) STORED,
        ADD CONSTRAINT \`fk_tuition_bills_supplement_course\`
          FOREIGN KEY (\`SupplementCourseId\`) REFERENCES \`Courses\` (\`id\`)
          ON DELETE RESTRICT ON UPDATE RESTRICT
    `)
  },

  async down(queryInterface, Sequelize) {
    const [supplement] = await queryInterface.sequelize.query(
      'SELECT id FROM \`TuitionBills\` WHERE \`SupplementCourseId\` IS NOT NULL LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    )
    if (supplement) {
      throw new Error('表內已有補開帳單（含歷史單）；無法安全退回每月只允許一張帳單。')
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE \`TuitionBills\`
        DROP FOREIGN KEY \`fk_tuition_bills_supplement_course\`,
        MODIFY COLUMN \`activeMarker\` TINYINT GENERATED ALWAYS AS (
          CASE WHEN \`status\` = 'void' THEN NULL ELSE 1 END
        ) STORED,
        DROP COLUMN \`SupplementCourseId\`
    `)
  }
}
