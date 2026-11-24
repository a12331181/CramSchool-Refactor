const common = require('./common')

module.exports = Object.freeze({
  addEnrollmentErrors: {
    COURSE_UNAVAILABLE: '課程不存在或已停止開課，無法註冊',
    STUDENT_UNAVAILABLE: '找不到在學學生，無法註冊課程',
    ENROLLMENT_HISTORY_REQUIRES_REVIEW: '舊選課期間尚未結束或日期不完整，請先核對紀錄'
  },
  removeEnrollmentErrors: {
    STUDENT_UNAVAILABLE: common.STUDENT_NOT_FOUND,
    COURSE_UNAVAILABLE: '找不到課程資料，請先核對選課紀錄',
    ENROLLMENT_NOT_ACTIVE: '這筆選課已失效，請重新確認目前的選課狀態',
    INVALID_END_DATE: '選課開始日晚於今天，請先核對參加期間'
  },
  getEnrollmentPageInvalidStudent: common.INVALID_STUDENT,
  addEnrollmentInvalidStudentCourse: '學生與課程 ID 必須是正整數',
  addEnrollmentUnavailableCourse: '無法註冊課程',
  addEnrollmentSavedCourse: '成功註冊課程',
  addEnrollmentUnchangedStudentCourse: '學生已經註冊此課程',
  removeEnrollmentInvalidStudentCourse: '學生與課程 ID 必須是正整數',
  removeEnrollmentInvalidEnrollment: '選課表單已過期或不完整，請重新整理選課頁後再試',
  removeEnrollmentSavedRecordEnrollment: '成功退選，原選課紀錄已保留',
  removeEnrollmentUnavailableCourseEnrollment: '無法退選課程'
})
