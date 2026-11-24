const responses = require('../constants/messages/adminStudent')
const { studentDirectoryQuery } = require('../utils/studentDirectory')
const { sendPageError } = require('../utils/pageError')
const { SEX_OPTIONS, GRADE_OPTIONS, STUDENT_STATUS_OPTIONS } = require('../constants/profileOptions')
const { discardUnusedProfileImage } = require('../services/profileImageService')
const studentService = require('../services/studentService')
const imageStorage = require('../utils/imageStorage')

const adminStudentController = {
  getCreateStudentPage: (req, res) => {
    return res.render('admin/students/form', { sexList: SEX_OPTIONS, gradeList: GRADE_OPTIONS, statusList: STUDENT_STATUS_OPTIONS })
  },

  createStudent: async (req, res) => {
    let uploadedImage
    let createCompleted = false

    try {
      const body = req.body ?? {}

      if (req.file) {
        uploadedImage = await imageStorage.saveImage({
          sourcePath: req.file.path
        })
      }

      const result = await studentService.createStudent({
        name: body.name,
        sex: body.sex,
        birth: body.birth,
        school: body.school,
        grade: body.grade,
        tel: body.tel,
        address: body.address,
        status: Number(body.status),
        image: uploadedImage?.url
      })

      if (!result.created) {
        if (result.reason === 'STUDENT_NUMBER_EXHAUSTED') {
          return sendPageError(res, 409, responses.createStudentInvalidStudent)
        }
        return sendPageError(res, 400, responses.createStudentInvalidStudentStatus)
      }

      createCompleted = true

      req.flash('success_messages', responses.createStudentSavedStudentProfile(result.studentNo))
      return res.redirect('/admin/students')
    } finally {
      if (uploadedImage && !createCompleted) {
        await discardUnusedProfileImage(uploadedImage.url)
      }

      if (req.file) {
        await imageStorage.discardTempFile(
          req.file.path
        )
      }
    }
  },

  getStudentDetailsPage: async (req, res) => {
    const studentId = Number(req.params.studentId)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return sendPageError(res, 400, responses.getStudentDetailsPageInvalidStudent)
    }

    const student = await studentService.getAdminStudentDetails(
      studentId
    )

    if (!student) {
      return res.redirect('/admin/students')
    }

    return res.render('admin/students/detail', {
      directoryQuery: studentDirectoryQuery(req.query), student
    })
  },

  getEditStudentPage: async (req, res) => {
    const studentId = Number(req.params.studentId)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return sendPageError(res, 400, responses.getEditStudentPageInvalidStudent)
    }

    const student = await studentService.getAdminStudentDetails(
      studentId
    )

    if (!student) {
      return res.redirect('/admin/students')
    }

    return res.render('admin/students/form', { student, sexList: SEX_OPTIONS, gradeList: GRADE_OPTIONS, statusList: STUDENT_STATUS_OPTIONS })
  },

  updateStudent: async (req, res) => {
    let uploadedImage
    let updateCompleted = false

    try {
      const studentId = Number(req.params.studentId)

      if (!Number.isSafeInteger(studentId) || studentId < 1) {
        return sendPageError(res, 400, responses.updateStudentInvalidStudent)
      }

      const body = req.body ?? {}

      if (req.file) {
        uploadedImage = await imageStorage.saveImage({
          sourcePath: req.file.path
        })
      }

      const result = await studentService.updateStudent(studentId, {
        name: body.name,
        sex: body.sex,
        birth: body.birth,
        school: body.school,
        grade: body.grade,
        tel: body.tel,
        address: body.address,
        status: Number(body.status),
        image: uploadedImage?.url
      })

      if (!result.updated) {
        if (result.reason === 'INVALID_STATUS') {
          return sendPageError(res, 400, responses.updateStudentInvalidStudentStatus)
        }

        if (result.reason === 'FUTURE_ENROLLMENT') {
          req.flash('error_messages', responses.updateStudentUnavailableStudentEnrollment)
          return res.redirect(`/admin/students/${studentId}/edit`)
        }

        req.flash('error_messages', responses.updateStudentNotFoundStudentProfile)
        return res.redirect('/admin/students')
      }

      updateCompleted = true

      req.flash('success_messages', responses.updateStudentSavedStudentProfile)
      return res.redirect('/admin/students')
    } finally {
      if (uploadedImage && !updateCompleted) {
        await discardUnusedProfileImage(uploadedImage.url)
      }

      if (req.file) {
        await imageStorage.discardTempFile(
          req.file.path
        )
      }
    }
  },

  deleteStudent: async (req, res) => {
    const studentId = Number(req.params.studentId)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return sendPageError(res, 400, responses.deleteStudentInvalidStudent)
    }

    const result = await studentService.deleteStudent(studentId)

    if (!result.deleted) {
      const errorMessages = responses.deleteStudentErrors

      req.flash(
        'error_messages',
        errorMessages[result.reason] ?? responses.deleteStudentUnavailableStudentProfile
      )

      return res.redirect('/admin/students')
    }

    req.flash('success_messages', responses.deleteStudentSavedStudentProfile)
    return res.redirect('/admin/students')
  },
}

module.exports = adminStudentController
