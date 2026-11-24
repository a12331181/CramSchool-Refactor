const common = require('./common')

module.exports = Object.freeze({
  recordAttendanceErrors: {
    INVALID_INPUT: common.INVALID_INPUT,
    CALENDAR_UNAVAILABLE: '找不到可登記的課堂。',
    CALENDAR_CHANGED: '上課時間已變更，請核對後再登記。',
    ENROLLMENT_UNCONFIRMED: '學生當天的選課期間無法確認，請先核對。',
    INVALID_STATUS: common.INVALID_STATUS,
    INVALID_REASON: common.INVALID_REASON,
    REASON_REQUIRED: common.REASON_REQUIRED
  },
  updateAttendanceErrors: {
    INVALID_INPUT: common.INVALID_INPUT,
    INVALID_STATUS: common.INVALID_STATUS,
    INVALID_REASON: common.INVALID_REASON,
    REASON_REQUIRED: common.REASON_REQUIRED,
    CORRECTION_REASON_REQUIRED: '請填寫 255 字以內的更正原因。',
    CALENDAR_UNAVAILABLE: '這堂課目前無法更正，請回首頁確認。',
    CALENDAR_CHANGED: '上課時間已變更，請重新核對。',
    ATTEND_NOT_FOUND: '找不到這筆點名紀錄。',
    ATTEND_REQUIRES_REVIEW: '這筆舊紀錄需要先核對。',
    VERSION_CONFLICT: '其他分頁已修改這筆點名，請核對重新載入的結果。',
    ENROLLMENT_UNCONFIRMED: '選課期間無法確認，請先核對。'
  },
  getAttendanceHomePageInvalidPage: common.INVALID_PAGE_3,
  getCourseAttendanceSessionsPageInvalidCourse: common.INVALID_COURSE_2,
  getCourseAttendanceSessionsPageInvalidPage: common.INVALID_PAGE_3,
  getCourseAttendanceSessionsPageInvalidMonth: '月份格式必須為 YYYY-MM。',
  getCourseAttendanceSessionsPageInvalidSessionStatus: '請選擇有效的課堂狀態。',
  getCourseAttendanceSessionsPageNotFoundCourse: '找不到可查看的課程。',
  getAttendanceRosterPageInvalidCourseSession: common.INVALID_COURSE_SESSION,
  getAttendanceRosterPageNotFoundSession: '找不到可查看的課堂',
  recordAttendanceInvalidStudentCourseSession: '課程、課堂、學生或時間格式不正確',
  recordAttendanceSavedAttendance: '已儲存點名。',
  recordAttendanceUnchangedRecordAttendance: '已有點名紀錄，本次未修改。',
  recordAttendanceUnavailable: '目前無法登記。',
  updateAttendanceInvalidStudentCourseSession: '課程、課堂、學生或點名版本格式不正確',
  updateAttendanceSavedRecordAttendance: '已更正點名並保存操作紀錄。',
  updateAttendanceUnchanged: '內容相同，沒有變更。',
  updateAttendanceUnavailable: '目前無法更正。',
  getAttendanceHistoryPageInvalidStudentCourseSession: '課程、課堂與學生 ID 必須是正整數',
  getAttendanceHistoryPageNotFoundRecordAttendance: '找不到可查看的點名紀錄'
})
