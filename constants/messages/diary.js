const common = require('./common')

module.exports = Object.freeze({
  getDiaryListPageInvalidPage: common.INVALID_PAGE,
  getCourseDiariesPageInvalidCourse: common.INVALID_COURSE,
  getCourseDiariesPageInvalidPage: common.INVALID_PAGE,
  createDiaryInvalidDateContent: common.INVALID_DATE_CONTENT,
  createDiaryMessageAttachment: common.MESSAGE_ATTACHMENT,
  createDiarySavedTeacherDiary: '已成功建立教師日誌',
  createDiaryNotFoundTeacherCourseProfile: '找不到可建立日誌的課程或教師資料',
  deleteDiaryMessageDiary: '只有日誌作者或管理員可以刪除。',
  deleteDiarySavedTeacherDiary: '已成功刪除教師日誌',
  deleteDiaryNotFoundDiary: '找不到該筆日誌'
})
