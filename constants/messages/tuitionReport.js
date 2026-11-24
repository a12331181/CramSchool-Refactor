const COURSE_COLLECTION_STATUS = require('../courseCollectionStatus')
const common = require('./common')

module.exports = Object.freeze({
  collectionLabels: {
    [COURSE_COLLECTION_STATUS.PAID]: ['已收齊', 'text-success'],
    [COURSE_COLLECTION_STATUS.UNPAID]: ['未收齊', 'text-danger'],
    [COURSE_COLLECTION_STATUS.REFUNDED]: ['已全額退費', 'text-info'],
    [COURSE_COLLECTION_STATUS.PARTIALLY_REFUNDED]: ['已部分退費', 'text-info'],
    [COURSE_COLLECTION_STATUS.UNISSUED]: ['部分未出帳', 'alert-warning px-1 rounded'],
    [COURSE_COLLECTION_STATUS.EMPTY]: ['本月無收費資料', 'text-muted'],
    [COURSE_COLLECTION_STATUS.NO_PAYMENT]: ['無須收款', 'text-muted'],
    [COURSE_COLLECTION_STATUS.REVIEW]: ['待核對', 'text-muted']
  },
  getStudentTuitionListPageErrors: {
    INVALID_BILLING_MONTH: common.INVALID_BILLING_MONTH,
    INVALID_PAGE: common.TUITION_REPORT_INVALID_PAGE,
    INVALID_TUITION_STATUS: '請選擇有效的帳單／收款狀態。'
  },
  getCourseMonthlyTuitionPageErrors: {
    INVALID_BILLING_MONTH: common.INVALID_BILLING_MONTH,
    INVALID_PAGE: common.TUITION_REPORT_INVALID_PAGE
  },
  getCoursePaymentOverviewPageInvalidPageFilter: '頁碼或收費篩選不正確。',
  getCoursePaymentOverviewPageInvalidMonth: '請選擇有效的計費月份。',
  getCoursePaymentOverviewPageUnavailableCourseProfile: '無法取得課程收費資料。',
  getStudentTuitionHistoryPageInvalidStudent: '學生 ID 必須是正整數。',
  getStudentTuitionHistoryPageInvalidStudentCourse: '課程與學生 ID 必須是正整數。',
  getStudentTuitionHistoryPageNotFoundCourse: '找不到課程。',
  getStudentTuitionHistoryPageNotFoundStudent: '找不到學生。',
  getStudentTuitionListPageInvalidPage: '頁碼不正確。',
  getStudentTuitionListPageUnavailableStudent: '目前無法取得學生學費列表。',
  getCourseMonthlyTuitionPageInvalidCourse: common.INVALID_COURSE_2,
  getCourseMonthlyTuitionPageInvalidPage: '頁碼不正確。',
  getCourseMonthlyTuitionPageNotFoundCourse: '找不到課程。',
  getCourseMonthlyTuitionPageUnavailableCourse: '目前無法取得課程月學費。'
})
