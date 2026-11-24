// 處理學生選課與退選，回傳實際異動結果。

const responses = require('../constants/messages/enrollment')

const enrollmentService = require('../services/enrollmentService')

const { sendPageError } = require('../utils/pageError')

const enrollmentController = {
  getEnrollmentPage: async (req, res) => {
    const studentId = Number(req.params.studentId)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return sendPageError(res, 400, responses.getEnrollmentPageInvalidStudent)
    }

    const result = await enrollmentService.getEnrollmentPage(studentId)

    if (!result) {
      return res.redirect('/admin/students')
    }

    return res.render('admin/students/enrollment', result)
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
      return sendPageError(res, 400, responses.addEnrollmentInvalidStudentCourse)
    }

    const { allowed, created, reason } = await enrollmentService.addEnrollment({
      studentId,
      courseId
    })
    
    if (!allowed) {
      const errorMessages = responses.addEnrollmentErrors

      req.flash(
        'error_messages',
        errorMessages[reason] ?? responses.addEnrollmentUnavailableCourse
      )

      const redirectUrl = reason === 'STUDENT_UNAVAILABLE'
        ? '/admin/students'
        : `/admin/students/${studentId}/enrolls`
      
      return res.redirect(redirectUrl)
    }

    req.flash(
      'success_messages',
      created ? responses.addEnrollmentSavedCourse : responses.addEnrollmentUnchangedStudentCourse
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
      return sendPageError(res, 400, responses.removeEnrollmentInvalidStudentCourse)
    }

    if (!Number.isSafeInteger(enrollmentId) || enrollmentId < 1) {
      return sendPageError(res, 400, responses.removeEnrollmentInvalidEnrollment)
    }

    const { removed, reason } = await enrollmentService.removeEnrollment({
      studentId,
      courseId,
      enrollmentId
    })

    const errorMessages = responses.removeEnrollmentErrors

    req.flash(
      removed ? 'success_messages' : 'error_messages',
      removed
        ? responses.removeEnrollmentSavedRecordEnrollment
        : errorMessages[reason] ?? responses.removeEnrollmentUnavailableCourseEnrollment
    )

    return res.redirect(
      reason === 'STUDENT_UNAVAILABLE'
        ? '/admin/students'
        : `/admin/students/${studentId}/enrolls`
    )
  },
}

module.exports = enrollmentController
