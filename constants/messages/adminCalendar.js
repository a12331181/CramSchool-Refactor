const COURSE_SESSION_BATCH_LIMIT = require('../courseSessionBatchLimit')
const common = require('./common')

module.exports = Object.freeze({
  batchSaveFailed: '目前無法批次新增課堂。',
  sessionSaveFailed: '無法新增課堂',
  sessionUpdateFailed: '更新課堂失敗',
  batchErrors: Object.freeze({
    INVALID_DATES: [400, `請選擇 1 到 ${COURSE_SESSION_BATCH_LIMIT} 個有效日期。`],
    DUPLICATE_DATES: [400, '日期不能重複，請重新選擇。'],
    INVALID_START_AT: [400, '開始時間不正確。'],
    INVALID_END_AT: [400, '結束時間不正確。'],
    INVALID_TIME_RANGE: [400, '同一天的結束時間必須晚於開始時間。'],
    INVALID_TEACHER_ID: [400, '請選擇有效的授課老師。'],
    INVALID_CONTENT: [400, '課堂內容必須是文字，且不能超過 40 個字。'],
    TEACHER_UNAVAILABLE: [409, '所選老師目前無法授課，請重新選擇。'],
    TIME_CONFLICT: [409, '以下日期與本課程、教室或所選老師的既有課堂重疊；本批未建立。'],
    UTC_TIMEZONE_REQUIRED: [500, '系統時間設定異常，暫時無法新增課堂。']
  }),
  getCourseCalendarPageErrors: {
    COURSE_NOT_FOUND: common.COURSE_NOT_FOUND,
    COURSE_CLOSED: '課程已關閉，暫不提供此操作頁面'
  },
  getCreateCourseSessionPageErrors: {
    COURSE_NOT_FOUND: common.COURSE_NOT_FOUND,
    COURSE_CLOSED: common.COURSE_CLOSED
  },
  createCourseSessionErrors: {
    INVALID_COURSE_ID: [400, common.INVALID_COURSE],
    INVALID_START_AT: [400, '開始日期或時間不正確'],
    INVALID_END_AT: [400, '結束日期或時間不正確'],
    INVALID_TIME_RANGE: [400, '結束時間必須晚於開始時間'],
    INVALID_TEACHER_ID: [400, '請選擇有效的授課教師'],
    INVALID_CONTENT: [400, '課堂內容必須是文字，且不可超過 40 個字元'],
    COURSE_NOT_FOUND: [404, common.COURSE_NOT_FOUND],
    COURSE_CLOSED: [409, common.COURSE_CLOSED],
    TEACHER_UNAVAILABLE: [409, '所選教師目前無法授課，請重新選擇'],
    TIME_CONFLICT: [409, '此課程、教室或授課教師已有重疊課堂，請調整時間'],
    UTC_TIMEZONE_REQUIRED: [500, '系統時間設定異常，暫時無法儲存課堂']
  },
  completeCourseSessionErrors: (result) => ({
    COURSE_NOT_FOUND: '找不到課程資料。',
    COURSE_CLOSED: '課程已關閉，目前無法完成課堂。',
    CALENDAR_NOT_FOUND: '找不到這門課程的課堂。',
    CALENDAR_NOT_COMPLETABLE: '只有已排定的正式課堂可以標記完成。',
    CALENDAR_REQUIRES_REVIEW: '課堂的教師或時間資料需要先核對。',
    CALENDAR_NOT_ENDED: '尚未到這堂課的結束時間。',
    ENROLLMENT_UNCONFIRMED: '學生的選課期間有缺漏或重疊，請先核對。',
    ATTEND_REQUIRES_REVIEW: '點名紀錄與選課資料需要先核對。',
    ATTEND_INCOMPLETE: `尚有 ${result.unmarkedCount} 位學生未點名，請先完成點名。`
  }),
  cancelCourseSessionErrors: (result) => ({
    COURSE_NOT_FOUND: common.COURSE_NOT_FOUND,
    COURSE_CLOSED: '課程已關閉，無法取消課堂',
    CALENDAR_NOT_FOUND: '找不到這門課程的課堂',
    CALENDAR_ALREADY_BILLED: `這堂課已列入正式帳單 #${result.billId}，未取消。請先核對相關帳單。`,
    CALENDAR_NOT_CANCELLABLE: '只有已排定的課堂可以取消'
  }),
  updateLegacyCalendarErrors: {
    INVALID_COURSE_ID: [400, common.INVALID_COURSE],
    INVALID_CALENDAR_ID: [400, '課堂 ID 必須是正整數'],
    INVALID_LEGACY_DATE: [400, '日期格式不正確'],
    INVALID_CONTENT: [400, '上課內容必須填寫，且不能超過 40 個字元'],
    COURSE_NOT_FOUND: [404, '找不到課程'],
    COURSE_CLOSED: [409, '課程已關閉，無法修改課堂'],
    LEGACY_CALENDAR_UNAVAILABLE: [409, '此課堂目前無法使用舊表單修改，請返回列表確認']
  },
  redirectFromUnavailableCourse_unavailableCourseSession: '課程已關閉，無法新增課堂。',
  redirectFromUnavailableCourse_notFoundCourseProfile: '找不到課程資料。',
  getCreateCourseSessionBatchPageInvalidCourse: common.INVALID_COURSE,
  createCourseSessionBatchInvalidCourse: common.INVALID_COURSE,
  createCourseSessionBatchInvalid: '表單已失效，請重新開啟批次排課頁。',
  createCourseSessionBatchInvalidRoom: '請選擇有效的教室。',
  createCourseSessionBatchMessage: (createdCount) => `已新增 ${createdCount} 堂課。`,
  getCourseCalendarPageInvalidCourse: common.INVALID_COURSE,
  getCourseCalendarPageInvalidPage: common.INVALID_PAGE,
  getCourseCalendarPageUnavailableCourse: '無法取得課程行事曆',
  getCreateCourseSessionPageInvalidCourse: common.INVALID_COURSE,
  getCreateCourseSessionPageUnavailableSession: '無法開啟新增課堂頁面',
  createCourseSessionInvalidCourse: common.INVALID_COURSE,
  createCourseSessionInvalidRoom: '請選擇有效的教室。',
  createCourseSessionMessageSession: (id) => `已新增課堂 #${id}`,
  createCourseSessionInvalidCourseStatus: '課程狀態已變動，請重新確認',
  completeCourseSessionInvalidCourseSession: common.INVALID_COURSE_SESSION,
  completeCourseSessionUnavailableSession: '目前無法完成課堂。',
  completeCourseSessionMessageSession: '已將課堂標記為已完成。',
  completeCourseSessionMessage: '這堂課原本就已完成。',
  cancelCourseSessionInvalidCourseSession: common.INVALID_COURSE_SESSION,
  cancelCourseSessionUnavailableSession: '無法取消課堂',
  cancelCourseSessionMessageSession: '已取消課堂',
  cancelCourseSessionUnchanged: '這堂課已經取消',
  getLegacyCalendarEditPageInvalidCourseSession: common.INVALID_COURSE_SESSION,
  getLegacyCalendarEditPageUnavailableDateSession: '此課堂目前無法使用舊日期表單修改，請返回課堂列表確認',
  updateLegacyCalendarSavedSessionProfile: '已成功更新課堂資料'
})
