const adminDashboardController = {
  getAdminDashboardPage: (_req, res) => {
    return res.render('admin/dashboard')
  }
}

module.exports = adminDashboardController
