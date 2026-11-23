const adminDashboardController = {
  getAdminDashboardPage: (_req, res) => {
    return res.render('admin/dashboard', {
      layout: 'workspace', workspaceTitle: '後台總覽', activeNav: 'admin-home'
    })
  }
}

module.exports = adminDashboardController
