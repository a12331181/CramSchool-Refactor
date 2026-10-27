const studentService = require('../services/studentService')
const imageStorage = require('../utils/imageStorage')
const { getPagination } = require('../utils/pagination')

const pageLimit = 12

const adminStudentController = {
  getStudents: async (req, res) => {
    const page = Number(req.query.page || 1)
    const courseId = req.query.courseId
      ? Number(req.query.courseId)
      : undefined

    if (!Number.isSafeInteger(page) || page < 1) {
      return res.status(400).send('頁碼必須是正整數')
    }

    if (
      courseId !== undefined &&
      (!Number.isSafeInteger(courseId) || courseId < 1)
    ) {
      return res.status(400).send('課程 ID 必須是正整數')
    }

    const result = await studentService.getAdminStudentsPage({
      page,
      pageSize: pageLimit,
      courseId
    })

    const pagination = getPagination({
      page,
      pageSize: pageLimit,
      totalCount: result.count
    })

    if (page > pagination.totalPages) {
      const queryParams = new URLSearchParams({
        page: String(pagination.totalPages)
      })

      if (courseId !== undefined) {
        queryParams.set('courseId', String(courseId))
      }

      return res.redirect(`/admin/students?${queryParams.toString()}`)
    }

    return res.render('admin/students', {
      students: result.rows,
      courses: result.courses,
      courseId: courseId ?? '',
      ...pagination
    })
  },

  getCreateStudentPage: (req, res) => {
    const sexList = [
      { id: 1, sex: '男' },
      { id: 2, sex: '女' },
    ]
    const statusList = [
      { id: 1, status: '在學' },
      { id: 2, status: '離開' }
    ]
    const gradeList = [
      { id: 1, grade: '一年級' },
      { id: 2, grade: '二年級' },
      { id: 3, grade: '三年級' },
      { id: 4, grade: '四年級' },
      { id: 5, grade: '五年級' },
      { id: 6, grade: '六年級' },
      { id: 7, grade: '七年級' },
      { id: 8, grade: '八年級' },
      { id: 9, grade: '九年級' },
      { id: 10, grade: '其他' },
    ]
    return res.render('admin/createstudent', {
      sexList: sexList,
      statusList: statusList,
      gradeList: gradeList
    })
  },

  postStudent: async (req, res) => {
    let uploadedImage
    let createCompleted = false

    try {
      const body = req.body ?? {}

      if (req.file) {
        uploadedImage = await imageStorage.saveImage({
          sourcePath: req.file.path,
          originalName: req.file.originalname
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
        return res.status(400).send('學生狀態不正確')
      }

      createCompleted = true

      req.flash('success_messages', '成功建立學生資料')
      return res.redirect('/admin/students')
    } finally {
      if (uploadedImage && !createCompleted) {
        await imageStorage.discardImage(
          uploadedImage.filename
        )
      }

      if (req.file) {
        await imageStorage.discardTempFile(
          req.file.path
        )
      }
    }
  },

  getStudent: async (req, res) => {
    const studentId = Number(req.params.id)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return res.status(400).send('學生 ID 必須是正整數')
    }

    const student = await studentService.getAdminStudentDetails(
      studentId
    )

    if (!student) {
      return res.redirect('/admin/students')
    }

    return res.render('admin/student', {
      student
    })
  },

  editStudent: async (req, res) => {
    const sexList = [
      { id: 1, sex: '男' },
      { id: 2, sex: '女' },
    ]
    const statusList = [
      { id: 1, status: '在學' },
      { id: 2, status: '離開' }
    ]
    const gradeList = [
      { id: 1, grade: '一年級' },
      { id: 2, grade: '二年級' },
      { id: 3, grade: '三年級' },
      { id: 4, grade: '四年級' },
      { id: 5, grade: '五年級' },
      { id: 6, grade: '六年級' },
      { id: 7, grade: '七年級' },
      { id: 8, grade: '八年級' },
      { id: 9, grade: '九年級' },
      { id: 10, grade: '其他' },
    ]
    const studentId = Number(req.params.id)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return res.status(400).send('學生 ID 必須是正整數')
    }

    const student = await studentService.getAdminStudentDetails(
      studentId
    )

    if (!student) {
      return res.redirect('/admin/students')
    }

    return res.render('admin/createstudent', {
      student,
      statusList,
      sexList,
      gradeList
    })
  },

  putStudent: async (req, res) => {
    let uploadedImage
    let updateCompleted = false

    try {
      const studentId = Number(req.params.id)

      if (!Number.isSafeInteger(studentId) || studentId < 1) {
        return res.status(400).send('學生 ID 必須是正整數')
      }

      const body = req.body ?? {}

      if (req.file) {
        uploadedImage = await imageStorage.saveImage({
          sourcePath: req.file.path,
          originalName: req.file.originalname
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

        req.flash('error_messages', '找不到學生資料')
        return res.redirect('/admin/students')
      }

      updateCompleted = true

      req.flash('success_messages', '成功更新學生資料')
      return res.redirect('/admin/students')
    } finally {
      if (uploadedImage && !updateCompleted) {
        await imageStorage.discardImage(
          uploadedImage.filename
        )
      }

      if (req.file) {
        await imageStorage.discardTempFile(
          req.file.path
        )
      }
    }
  },

  deleteStudent: async (req, res) => {
    const studentId = Number(req.params.id)

    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      return res.status(400).send('學生 ID 必須是正整數')
    }

    const result = await studentService.deleteStudent(studentId)

    if (!result.deleted) {
      const errorMessages = {
        STUDENT_NOT_FOUND: '找不到學生資料',
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