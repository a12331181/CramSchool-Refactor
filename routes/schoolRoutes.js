const { Router } = require('express')
const { authenticated, authenticatedAdmin } = require('../middlewares/auth')
const schoolController = require('../controllers/schoolController')
const meetingController = require('../controllers/meetingController')
const diaryController = require('../controllers/diaryController')

const router = Router()

router.get('/', authenticated, schoolController.getHomePage)
router.get('/introduction', authenticated, schoolController.getIntroductionPage)
router.get('/meetings', authenticated, meetingController.getMeetingListPage)
router.get('/meetings/create', authenticated, meetingController.getCreateMeetingPage)
router.get('/meetings/:meetingId', authenticated, meetingController.getMeetingDetailsPage)
router.post('/meetings', authenticated, meetingController.createMeeting)
router.delete('/meetings/:meetingId', authenticatedAdmin, meetingController.deleteMeeting)
router.delete('/diaries/:diaryId', authenticated, diaryController.deleteDiary)
router.get('/diaries', authenticated, diaryController.getDiaryListPage)
router.get('/courses/:courseId/diaries', authenticated, diaryController.getCourseDiariesPage)
router.get('/courses/:courseId/diaries/create', authenticated, diaryController.getCreateDiaryPage)
router.post('/courses/:courseId/diaries', authenticated, diaryController.createDiary)
router.get('/courses/:courseId/diaries/:diaryId', authenticated, diaryController.getDiaryDetailsPage)
router.delete('/courses/:courseId/diaries/:diaryId', authenticated, diaryController.deleteDiary)

module.exports = router
