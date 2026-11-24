const common = require('./common')

module.exports = Object.freeze({
  getCourseTuitionPreviewPageErrors: {
    INVALID_BILLING_MONTH: common.INVALID_BILLING_MONTH,
    UTC_TIMEZONE_REQUIRED: common.UTC_TIMEZONE_REQUIRED,
    ENROLLMENT_NOT_FOUND: '找不到這位學生在本課程的選課紀錄。',
    NOT_ENROLLED_IN_BILLING_MONTH: '這位學生在本月沒有有效的選課期間。',
    ENROLLMENT_UNCONFIRMED: '選課期間有缺漏或重疊，請先核對。',
    CALENDAR_REQUIRES_REVIEW: '課堂時間資料需要先核對。',
    COURSE_NOT_FOUND: '找不到課程。',
    STUDENT_NOT_FOUND: common.TUITION_BILL_STUDENT_NOT_FOUND,
    INVALID_BILLING_TYPE: '請先核對課程的計費方式。',
    INVALID_PRICE: '請先核對課程價格。',
    INVALID_AMOUNT: common.INVALID_AMOUNT
  },
  getStudentTuitionPreviewPageErrors: {
    INVALID_BILLING_MONTH: common.INVALID_BILLING_MONTH,
    UTC_TIMEZONE_REQUIRED: common.UTC_TIMEZONE_REQUIRED,
    STUDENT_NOT_FOUND: common.TUITION_BILL_STUDENT_NOT_FOUND,
    NO_COURSES_IN_BILLING_MONTH: '這位學生在本月沒有有效選課的課程。',
    ENROLLMENT_COURSE_UNCONFIRMED: '這筆選課的課程資料需要核對。',
    ENROLLMENT_NOT_FOUND: '找不到選課紀錄，請先核對。',
    ENROLLMENT_UNCONFIRMED: '選課期間或狀態需要核對。',
    COURSE_NOT_FOUND: '找不到課程，請先核對。',
    INVALID_BILLING_TYPE: '課程的計費方式需要核對。',
    INVALID_PRICE: '課程價格需要核對。',
    INVALID_AMOUNT: common.INVALID_AMOUNT,
    CALENDAR_REQUIRES_REVIEW: '課堂時間需要核對。',
    NO_BILLABLE_CALENDARS: '本月沒有符合條件的正式課堂。',
    CALENDAR_REVIEW_UNAVAILABLE: '尚未取得課堂核對資訊。',
    CALENDARS_REQUIRE_REVIEW: '有課堂日期或狀態需要核對。',
    ATTENDANCE_SUMMARY_UNAVAILABLE: '尚未取得點名摘要。',
    ATTENDANCE_REQUIRES_REVIEW: '有點名項目需要人工核對。'
  },
  recordLeaveReviewErrors: {
    UTC_REQUIRED: '系統時間設定異常，暫時無法儲存審核。',
    LEAVE_UNAVAILABLE: '這筆請假已無法審核，請先核對點名資料。',
    ATTEND_CHANGED: '老師已更正點名，請核對新的請假原因。',
    REVIEW_CHANGED: '審核已更新，請核對目前的結果。'
  },
  getCourseTuitionPreviewPageInvalidStudentCourse: common.INVALID_STUDENT_COURSE,
  getCourseTuitionPreviewPageUnavailable: '目前無法試算學費。',
  getStudentTuitionPreviewPageInvalidStudent: common.INVALID_STUDENT,
  getStudentTuitionPreviewPageUnavailable: '目前無法試算。',
  recordLeaveReviewInvalid: '表單已失效，請重新開啟學費預覽再試。',
  recordLeaveReviewInvalidProfile: '審核資料格式不正確，請重新確認結果和備註。',
  recordLeaveReviewSavedLeave: '已儲存請假審核。',
  recordLeaveReviewUnchanged: '審核結果沒有變更。',
  recordLeaveReviewUnavailable: '目前無法儲存審核。'
})
