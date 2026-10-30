'use strict'

module.exports = {
  async up(queryInterface) {
    const [missingIds] = await queryInterface.sequelize.query(`
      SELECT id
      FROM Enrollments
      WHERE StudentId IS NULL OR CourseId IS NULL
      LIMIT 1
    `)

    if (missingIds.length > 0) {
      throw new Error('選課紀錄缺少學生或課程 ID，請先核對資料')
    }

    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT StudentId, CourseId, COUNT(*) AS recordCount
      FROM Enrollments
      WHERE status = 'active'
      GROUP BY StudentId, CourseId
      HAVING COUNT(*) > 1
      LIMIT 1
    `)

    if (duplicates.length > 0) {
      throw new Error('存在重複的有效選課，請先核對資料')
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE Enrollments
        MODIFY COLUMN StudentId INT NOT NULL,
        MODIFY COLUMN CourseId INT NOT NULL,
        ADD COLUMN activeMarker TINYINT
          GENERATED ALWAYS AS (
            CASE WHEN status = 'active' THEN 1 ELSE NULL END
          ) STORED,
        ADD UNIQUE INDEX uq_enrollments_active_student_course
          (StudentId, CourseId, activeMarker)
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE Enrollments
        DROP INDEX uq_enrollments_active_student_course,
        DROP COLUMN activeMarker,
        MODIFY COLUMN StudentId INT NULL,
        MODIFY COLUMN CourseId INT NULL
    `)
  }
}