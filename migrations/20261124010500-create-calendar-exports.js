'use strict'
module.exports = {
  async up(q,S) {
    await q.createTable('CalendarExports',{
      id:{type:S.INTEGER,primaryKey:true,autoIncrement:true},
      CalendarId:{type:S.INTEGER,allowNull:false,references:{model:'Calendars',key:'id'},onDelete:'RESTRICT'},
      destination:{type:S.STRING(64),allowNull:false}, eventId:{type:S.STRING(64),allowNull:false},
      fingerprint:S.STRING(64)
    })
    await q.addIndex('CalendarExports',['destination','CalendarId'],{unique:true})
  },
  down(q) { return q.dropTable('CalendarExports') }
}
