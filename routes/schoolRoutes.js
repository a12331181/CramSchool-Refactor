const { Router } = require('express')
const { authenticated, authenticatedAdmin } = require('../middlewares/auth')
const schoolController = require('../controllers/schoolController')

const router = Router()

router.get('/', authenticated, schoolController.getSchoolIndexPage)
router.get('/introduction', authenticated, schoolController.getIntroduction)
router.get('/meetings', authenticated, schoolController.getMeetings)
router.get('/meetings/create', authenticated, schoolController.getCreateMeetingPage)
router.get('/meetings/:id', authenticated, schoolController.getMeeting)
router.post('/meetings', authenticated, schoolController.createMeeting)
router.delete('/meetings/:id', authenticatedAdmin, schoolController.deleteMeeting)
router.delete('/diaries/:id', authenticatedAdmin, schoolController.deleteDiaryInList)
router.get('/diaries', authenticated, schoolController.getDiariesList)
router.get('/courses/:id/diaries', authenticated, schoolController.getDiaries)
router.get('/courses/:id/diaries/create', authenticated, schoolController.getCreateDiaryPage)
router.post('/courses/:id/diaries', authenticated, schoolController.createDiary)
router.get('/courses/:courseId/diaries/:diaryId', authenticated, schoolController.getDiary)
router.delete('/courses/:courseId/diaries/:diaryId', authenticated, schoolController.deleteDiary)

module.exports = router
