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
      const errorMessages = {
        COURSE_UNAVAILABLE: '課程不存在或已停止開課，無法註冊',
        STUDENT_UNAVAILABLE: '找不到在學學生，無法註冊課程',
        ENROLLMENT_HISTORY_REQUIRES_REVIEW: '舊選課期間尚未結束或日期不完整，請先核對紀錄'
      }

      req.flash(
        'error_messages',
        errorMessages[reason] ?? '無法註冊課程'
      )

      const redirectUrl = reason === 'STUDENT_UNAVAILABLE'
        ? '/admin/students'
        : `/admin/students/${studentId}/enrolls`
      
      return res.redirect(redirectUrl)
    }

    req.flash(
      'success_messages',
      created ? '成功註冊課程' : '學生已經註冊此課程'
    )

    return res.redirect(
      `/admin/students/${studentId}/enrolls`
    )
  },

  removeEnrollment: async (req, res) => {
    const studentId = Number(req.params.studentId)
    const courseId = Number(req.params.courseId)
    const enrollmentId = Number(req.body?.enrollmentId)
    if (
      !Number.isSafeInteger(studentId) ||
      studentId < 1 ||
      !Number.isSafeInteger(courseId) ||
      courseId < 1
    ) {
      return res.status(400).send('學生與課程 ID 必須是正整數')
    }

    if (!Number.isSafeInteger(enrollmentId) || enrollmentId < 1) {
      return res.status(400).send('選課表單已過期或不完整，請重新整理選課頁後再試')
    }

    const { removed, reason } = await enrollmentService.removeEnrollment({
      studentId,
      courseId,
      enrollmentId
    })

    const errorMessages = {
      STUDENT_UNAVAILABLE: '找不到學生資料',
      COURSE_UNAVAILABLE: '找不到課程資料，請先核對選課紀錄',
      ENROLLMENT_NOT_ACTIVE: '這筆選課已失效，請重新確認目前的選課狀態',
      INVALID_END_DATE: '選課開始日晚於今天，請先核對參加期間'
    }

    req.flash(
      removed ? 'success_messages' : 'error_messages',
      removed
        ? '成功退選，原選課紀錄已保留'
        : errorMessages[reason] ?? '無法退選課程'
    )

    return res.redirect(
      reason === 'STUDENT_UNAVAILABLE'
        ? '/admin/students'
        : `/admin/students/${studentId}/enrolls`
    )
  },
}

module.exports = enrollmentController