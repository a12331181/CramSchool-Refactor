const common = require('./common')

module.exports = Object.freeze({
  getMeetingListPageInvalidPage: common.INVALID_PAGE,
  createMeetingInvalidDateContent: common.INVALID_DATE_CONTENT,
  createMeetingMessageAttachment: common.MESSAGE_ATTACHMENT,
  createMeetingNotFoundTeacherRecordProfile: '找不到教師資料，無法建立會議紀錄',
  createMeetingSavedRecordMeeting: '已成功建立會議紀錄',
  deleteMeetingSavedRecordMeeting: '已成功刪除會議紀錄',
  deleteMeetingNotFoundRecordMeeting: '找不到會議紀錄'
})
