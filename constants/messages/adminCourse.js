const { MAX_COURSE_PRICE } = require('../courseOptions')
const common = require('./common')

const courseSettings = Object.freeze({
  INVALID_TIME: '上課時長只能是 60、90 或 120 分鐘',
  INVALID_TYPE: '計費方式不正確',
  INVALID_PRICE: `價格須為 0 到 ${MAX_COURSE_PRICE} 元的整數。`,
  INVALID_TEACHER_ID: '教師 ID 不正確'
})

module.exports = Object.freeze({
  courseSettings,
  createCourseErrors: {
    INVALID_NAME: '課程名稱必填，且不可超過 255 字',
    INVALID_COURSE_PREFIX: '請選擇兩個大寫英文字母作為課程編號開頭',
    COURSE_NUMBER_EXHAUSTED: '這個課程前綴的編號已用完，請改用其他前綴',
    ...courseSettings,
    TEACHER_UNAVAILABLE: common.TEACHER_UNAVAILABLE
  },
  updateCourseErrors: {
    COURSE_NOT_FOUND: common.COURSE_NOT_FOUND,
    COURSE_CLOSED: '課程已關閉，無法修改',
    TEACHER_UNAVAILABLE: common.TEACHER_UNAVAILABLE
  },
  deleteCourseErrors: {
    COURSE_NOT_FOUND: common.COURSE_NOT_FOUND,
    COURSE_HAS_TUITION_BILL_ITEMS: '課程已有月帳單明細，無法刪除。請改用「關閉課程」保留歷史資料。',
    COURSE_HAS_SESSION_RECORDS: '課程已有課堂紀錄，無法刪除，請改用關閉課程',
    COURSE_HAS_ENROLLMENTS: '課程已有學生選課，請改用關閉課程',
    COURSE_HAS_TUITIONS: '課程已有學費帳單，無法刪除',
    COURSE_HAS_DIARIES: '課程已有教學日誌，無法刪除',
    COURSE_HAS_CLOSED_CALENDARS: '課程已有關閉的課堂紀錄，無法刪除',
    COURSE_HAS_ATTENDANCE: '課程已有點名紀錄，無法刪除'
  },
  getCourseListPageInvalidPage: common.INVALID_PAGE,
  createCourseInvalidCourseProfile: '課程資料不正確',
  createCourseSavedCourse: (courseNo) => `成功建立課程｜${courseNo}`,
  getEditCoursePageInvalidCourse: common.INVALID_COURSE,
  updateCourseInvalidCourse: common.INVALID_COURSE,
  updateCourseUnavailableCourse: '無法修改課程',
  updateCourseSavedCourse: '成功修改課程',
  deleteCourseInvalidCourse: common.INVALID_COURSE,
  deleteCourseUnavailableCourse: '無法刪除課程',
  deleteCourseSavedCourse: '已成功刪除課程',
  closeCourseInvalidCourse: common.INVALID_COURSE,
  closeCourseNotFoundCourseProfile: '找不到課程資料',
  closeCourseSavedCourse: '已成功關閉課程',
  closeCourseUnchangedCourseStatus: '課程已經是關閉狀態',
  openCourseInvalidCourse: common.INVALID_COURSE,
  openCourseNotFoundCourseProfile: '找不到課程資料',
  openCourseSavedCourse: '已成功開啟課程',
  openCourseUnchangedCourseStatus: '課程已經是開啟狀態'
})
