const teacherService = require('../services/teacherService')
const TEACHER_STATUS = require('../constants/teacherStatus')
const { getPagination } = require('../utils/pagination')

const pageLimit = 12

const adminTeacherController = {
  getTeachers: async (req, res) => {
    const page = Number(req.query.page || 1)
    const status = req.query.status
      ? Number(req.query.status)
      : undefined

    if (!Number.isSafeInteger(page) || page < 1) {
      return res.status(400).send('頁碼必須是正整數')
    }

    if (
      status !== undefined &&
      !Object.values(TEACHER_STATUS).includes(status)
    ) {
      return res.status(400).send('教師狀態不正確')
    }

    const result = await teacherService.getTeachersPage({
      page,
      pageSize: pageLimit,
      status
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

      if (status !== undefined) {
        queryParams.set('status', String(status))
      }

      return res.redirect(`/admin/teachers?${queryParams.toString()}`)
    }

    return res.render('admin/teachers', {
      teachers: result.rows,
      status: status ?? '',
      statusList: [
        { id: TEACHER_STATUS.ACTIVE, status: '在職' },
        { id: TEACHER_STATUS.ON_LEAVE, status: '留職停薪' },
        { id: TEACHER_STATUS.LEFT, status: '離職' }
      ],
      ...pagination
    })
  },

  getTeacher: async (req, res) => {
    const teacherId = Number(req.params.id)

    if (!Number.isSafeInteger(teacherId) || teacherId < 1) {
      return res.status(400).send('教師 ID 必須是正整數')
    }

    const teacher = await teacherService.getTeacherDetails(teacherId)

    if (!teacher) {
      return res.redirect('/admin/teachers')
    }

    return res.render('admin/teacher', {
      teacher
    })
  },

  editTeacher: async (req, res) => {
    const teacherId = Number(req.params.id)

    if (!Number.isSafeInteger(teacherId) || teacherId < 1) {
      return res.status(400).send('教師 ID 必須是正整數')
    }

    const teacher = await teacherService.getTeacherDetails(teacherId)

    if (!teacher) {
      return res.redirect('/admin/teachers')
    }

    return res.render('admin/editteacher', {
      teacher,
      sexList: [
        { id: 1, sex: '男' },
        { id: 2, sex: '女' }
      ],
      statusList: [
        { id: TEACHER_STATUS.ACTIVE, status: '在職' },
        { id: TEACHER_STATUS.ON_LEAVE, status: '留職停薪' },
        { id: TEACHER_STATUS.LEFT, status: '離職' }
      ]
    })
  },

  updateTeacher: async (req, res) => {
    const teacherId = Number(req.params.id)

    if (!Number.isSafeInteger(teacherId) || teacherId < 1) {
      return res.status(400).send('教師 ID 必須是正整數')
    }

    const body = req.body ?? {}

    const result = await teacherService.updateTeacher(teacherId, {
      name: body.name,
      sex: body.sex,
      birth: body.birth,
      phone: body.phone,
      address: body.address,
      education: body.education,
      school: body.school,
      status: Number(body.status)
    })

    if (!result.updated) {
      if (result.reason === 'INVALID_STATUS') {
        return res.status(400).send('教師狀態不正確')
      }

      req.flash('error_messages', '找不到教師資料')
      return res.redirect('/admin/teachers')
    }

    req.flash('success_messages', '成功修改教師資料')
    return res.redirect('/admin/teachers')
  },
}

module.exports = adminTeacherController