const { getTaipeiDate } = require('../utils/date')
const meetingService = require('../services/meetingService')
const diaryService = require('../services/diaryService')

const schoolController = {
  getHomePage: async (req, res) => {
    const [meetings, diaries] = await Promise.all([
      meetingService.getRecentMeetings(5),
      diaryService.getRecentDiaries(4)
    ])
    return res.render('school/home', {
      layout: 'workspace', workspaceTitle: '校務總覽', activeNav: 'home',
      today: getTaipeiDate(), isAdmin: req.user.isAdmin, meetings, diaries
    })
  },

  getIntroductionPage: (req, res) => {
    return res.render('school/introduction')
  }
}

module.exports = schoolController
