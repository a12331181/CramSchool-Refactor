const recordUpload = require('../middlewares/recordUpload')
const { verifyForm } = require('../middlewares/formSecurity')
const { download } = require('../controllers/recordAttachmentController')
const { Router } = require('express')
const { authenticated, authenticatedAdmin } = require('../middlewares/auth')
const schoolController = require('../controllers/schoolController')
const meetingController = require('../controllers/meetingController')
const diaryController = require('../controllers/diaryController')

const timetable = require('../controllers/timetableController')

const router = Router()

router.get('/timetable', authenticated, timetable.timetable)
router.post('/timetable/rooms', authenticatedAdmin, timetable.addRoom)

router.get('/', authenticated, schoolController.getHomePage)
router.get('/introduction', authenticated, schoolController.getIntroductionPage)
router.get('/meetings', authenticated, meetingController.getMeetingListPage)
router.get('/meetings/create', authenticated, meetingController.getCreateMeetingPage)
router.get('/meetings/:meetingId', authenticated, meetingController.getMeetingDetailsPage)
router.post('/meetings', authenticated, recordUpload, verifyForm, meetingController.createMeeting)
router.delete('/meetings/:meetingId', authenticatedAdmin, meetingController.deleteMeeting)
router.delete('/diaries/:diaryId', authenticated, diaryController.deleteDiary)
router.get('/diaries', authenticated, diaryController.getDiaryListPage)
router.get('/courses/:courseId/diaries', authenticated, diaryController.getCourseDiariesPage)
router.get('/courses/:courseId/diaries/create', authenticated, diaryController.getCreateDiaryPage)
router.post('/courses/:courseId/diaries', authenticated, recordUpload, verifyForm, diaryController.createDiary)
router.get(
  '/courses/:courseId/diaries/:diaryId',
  authenticated,
  diaryController.getDiaryDetailsPage
)
router.delete('/courses/:courseId/diaries/:diaryId', authenticated, diaryController.deleteDiary)

router.get('/meetings/:meetingId/attachments/:fileId', authenticated, download)
router.get('/courses/:courseId/diaries/:diaryId/attachments/:fileId', authenticated, download)

module.exports = router
