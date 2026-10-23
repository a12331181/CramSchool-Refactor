const enrollmentService = require('../services/enrollmentService')

const enrollmentController = {
  enrollCoursePage: async (req, res) => {
    const studentId = Number(req.params.id)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return res.status(400).send('學生 ID 必須是正整數')
    }

    const result = await enrollmentService.getEnrollmentPage(studentId)

    if (!result) {
      return res.redirect('/admin/students')
    }

    return res.render('admin/enrollcourse', result)
  },

  addEnrollment: async (req, res) => {
    const studentId = Number(req.params.studentId)
    const courseId = Number(req.params.courseId)
    if (
      !Number.isSafeInteger(studentId) ||
      studentId < 1 ||
      !Number.isSafeInteger(courseId) ||
      courseId < 1
    ) {
      return res.status(400).send('學生與課程 ID 必須是正整數')
    }

    const { allowed, created, reason } = await enrollmentService.addEnrollment({
      studentId,
      courseId
    })
    
    if (!allowed) {
      const isCourseUnavailable = reason === 'COURSE_UNAVAILABLE'

      req.flash(
        'error_messages',
        isCourseUnavailable
          ? '課程不存在或已停止開課，無法註冊'
          : '找不到在學學生，無法註冊課程'
      )

      const redirectUrl = isCourseUnavailable
        ? `/admin/students/${studentId}/enrolls`
        : '/admin/students'
      
      return res.redirect(redirectUrl)
    }

    req.flash(
      'success_messages',
      created ? '成功註冊課程' : '學生已經註冊此課程'
    )

    return res.redirect(
      `/admin/students/${req.params.studentId}/enrolls`
    )
  },

  removeEnrollment: async (req, res) => {
    const studentId = Number(req.params.studentId)
    const courseId = Number(req.params.courseId)
    if (
      !Number.isSafeInteger(studentId) ||
      studentId < 1 ||
      !Number.isSafeInteger(courseId) ||
      courseId < 1
    ) {
      return res.status(400).send('學生與課程 ID 必須是正整數')
    }
    const { removed } = await enrollmentService.removeEnrollment({
      studentId,
      courseId
    })
    req.flash(
      'success_messages',
      removed
        ? '成功註銷課程'
        : '此學生目前未註冊此課程'
    )

    return res.redirect(
      `/admin/students/${studentId}/enrolls`
    )
  },
}

module.exports = enrollmentController