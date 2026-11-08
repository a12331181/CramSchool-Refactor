'use strict'

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {}

  AuditLog.init({
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: 1 }
    },
    entityType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: { notEmpty: true }
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: 1 }
    },
    action: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: { notEmpty: true }
    },
    before: DataTypes.JSON,
    after: DataTypes.JSON,
    reason: DataTypes.STRING(255),
    occurredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    requestId: DataTypes.STRING(64)
  }, {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'AuditLogs',
    timestamps: false
  })

  return AuditLog
}