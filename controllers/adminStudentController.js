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
          return res.status(409).send('今年的學生編號已用完，請聯繫管理員。')
        }
        return res.status(400).send('學生狀態不正確')
      }

      createCompleted = true

      req.flash('success_messages', `成功建立學生資料｜${result.studentNo}`)
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
      return res.status(400).send('學生 ID 必須是正整數')
    }

    const student = await studentService.getAdminStudentDetails(
      studentId
    )

    if (!student) {
      return res.redirect('/admin/students')
    }

    return res.render('admin/students/detail', {
      student
    })
  },

  getEditStudentPage: async (req, res) => {
    const studentId = Number(req.params.studentId)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return res.status(400).send('學生 ID 必須是正整數')
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
        return res.status(400).send('學生 ID 必須是正整數')
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
          return res.status(400).send('學生狀態不正確')
        }

        if (result.reason === 'FUTURE_ENROLLMENT') {
          req.flash('error_messages', '學生有尚未開始的選課，請先核對參加期間')
          return res.redirect(`/admin/students/${studentId}/edit`)
        }

        req.flash('error_messages', '找不到學生資料')
        return res.redirect('/admin/students')
      }

      updateCompleted = true

      req.flash('success_messages', '成功更新學生資料')
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
      return res.status(400).send('學生 ID 必須是正整數')
    }

    const result = await studentService.deleteStudent(studentId)

    if (!result.deleted) {
      const errorMessages = {
        STUDENT_NOT_FOUND: '找不到學生資料',
        HAS_TUITION_BILLS: '學生已有月帳單紀錄，無法刪除。請改用「離開」保留歷史資料。',
        HAS_ENROLLMENTS: '已有選課紀錄，無法刪除學生，請改用離開狀態',
        HAS_ATTENDANCE: '已有出席紀錄，無法刪除學生，請改用離開狀態',
        HAS_TUITION: '已有學費紀錄，無法刪除學生，請改用離開狀態'
      }

      req.flash(
        'error_messages',
        errorMessages[result.reason] ?? '無法刪除學生資料'
      )

      return res.redirect('/admin/students')
    }

    req.flash('success_messages', '成功刪除學生資料')
    return res.redirect('/admin/students')
  },
}

module.exports = adminStudentController
