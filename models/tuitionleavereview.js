'use strict'

module.exports = (sequelize, DataTypes) => sequelize.define('TuitionLeaveReview', {
  AttendId: { type: DataTypes.INTEGER, allowNull: false },
  attendVersion: { type: DataTypes.INTEGER, allowNull: false },
  decision: { type: DataTypes.ENUM('approved', 'rejected'), allowNull: false },
  reason: { type: DataTypes.STRING(255), allowNull: false },
  reviewedBy: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'TuitionLeaveReviews',
  timestamps: true,
  updatedAt: false
})