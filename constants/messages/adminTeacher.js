const common = require('./common')

module.exports = Object.freeze({
  getTeacherListPageInvalidPage: common.INVALID_PAGE,
  getTeacherListPageInvalidTeacherStatus: '教師狀態不正確',
  getTeacherDetailsPageInvalidTeacher: '教師 ID 必須是正整數',
  getEditTeacherPageInvalidTeacher: '教師 ID 必須是正整數',
  updateTeacherInvalidTeacher: '教師 ID 必須是正整數',
  updateTeacherInvalidTeacherStatus: '教師狀態不正確',
  updateTeacherNotFoundTeacherProfile: '找不到教師資料',
  updateTeacherSavedTeacherProfile: '成功修改教師資料'
})
