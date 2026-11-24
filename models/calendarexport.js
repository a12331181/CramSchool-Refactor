module.exports = (sequelize, S) =>
  sequelize.define(
    'CalendarExport',
    {
      CalendarId: { type: S.INTEGER, allowNull: false },
      destination: { type: S.STRING(64), allowNull: false },
      eventId: { type: S.STRING(64), allowNull: false },
      fingerprint: S.STRING(64)
    },
    { timestamps: false, indexes: [{ unique: true, fields: ['destination', 'CalendarId'] }] }
  )
