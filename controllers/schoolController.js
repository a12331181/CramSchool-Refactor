// 組合首頁的今日課堂、會議、日誌及個人資料提醒。

const diaryService = require('../services/diaryService')
const meetingService = require('../services/meetingService')
const { getIncompleteProfileFields } = require('../services/teacherService')
const { getTodaySessions } = require('../services/timetableService')

const { getTaipeiDate } = require('../utils/date')

const schoolController = {
  getHomePage: async (req, res) => {
    const [meetings, diaries, missingFields, sessions] = await Promise.all([
      meetingService.getRecentMeetings(5),
      diaryService.getRecentDiaries(4),
      getIncompleteProfileFields(req.user.id),
      getTodaySessions(req.user)
    ])
    return res.render('school/home', {
      layout: 'workspace', workspaceTitle: '校務總覽', activeNav: 'home',
      sessions, missingFields: missingFields.join('、'), today: getTaipeiDate(), isAdmin: req.user.isAdmin, meetings, diaries
    })
  },

  getIntroductionPage: (req, res) => {
    return res.render('school/introduction')
  }
}

module.exports = schoolController
