const common = require('./common')

module.exports = Object.freeze({
  deleteStudentErrors: {
    STUDENT_NOT_FOUND: common.STUDENT_NOT_FOUND,
    HAS_TUITION_BILLS: '學生已有月帳單紀錄，無法刪除。請改用「離開」保留歷史資料。',
    HAS_ENROLLMENTS: '已有選課紀錄，無法刪除學生，請改用離開狀態',
    HAS_ATTENDANCE: '已有出席紀錄，無法刪除學生，請改用離開狀態',
    HAS_TUITION: '已有學費紀錄，無法刪除學生，請改用離開狀態'
  },
  createStudentInvalidStudent: '今年的學生編號已用完，請聯繫管理員。',
  createStudentInvalidStudentStatus: '學生狀態不正確',
  createStudentSavedStudentProfile: (studentNo) => `成功建立學生資料｜${studentNo}`,
  getStudentDetailsPageInvalidStudent: common.INVALID_STUDENT,
  getEditStudentPageInvalidStudent: common.INVALID_STUDENT,
  updateStudentInvalidStudent: common.INVALID_STUDENT,
  updateStudentInvalidStudentStatus: '學生狀態不正確',
  updateStudentUnavailableStudentEnrollment: '學生有尚未開始的選課，請先核對參加期間',
  updateStudentNotFoundStudentProfile: '找不到學生資料',
  updateStudentSavedStudentProfile: '成功更新學生資料',
  deleteStudentInvalidStudent: common.INVALID_STUDENT,
  deleteStudentUnavailableStudentProfile: '無法刪除學生資料',
  deleteStudentSavedStudentProfile: '成功刪除學生資料'
})
