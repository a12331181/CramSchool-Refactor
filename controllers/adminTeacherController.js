const { SEX_OPTIONS, TEACHER_STATUS_OPTIONS } = require('../constants/profileOptions')
const { DIRECTORY_PAGE_SIZE } = require('../constants/pagination')
const teacherService = require('../services/teacherService')
const TEACHER_STATUS = require('../constants/teacherStatus')
const { getPageOffset, getPagination, getPaginationLinks } = require('../utils/pagination')

const adminTeacherController = {
  getTeacherListPage: async (req, res) => {
    const listPage = getPageOffset(req.query.page, DIRECTORY_PAGE_SIZE)
    if (!listPage) return res.status(400).send('頁碼必須是正整數')
    const { page } = listPage
    const status = req.query.status
      ? Number(req.query.status)
      : undefined

    if (
      status !== undefined &&
      !Object.values(TEACHER_STATUS).includes(status)
    ) {
      return res.status(400).send('教師狀態不正確')
    }

    const result = await teacherService.getTeachersPage({
      page,
      pageSize: DIRECTORY_PAGE_SIZE,
      status
    })

    const pagination = getPagination({
      page,
      pageSize: DIRECTORY_PAGE_SIZE,
      totalCount: result.count
    })

    const pageUrl = targetPage => {
      const queryParams = new URLSearchParams({ page: String(targetPage) })
      if (status !== undefined) {
        queryParams.set('status', String(status))
      }
      return `/admin/teachers?${queryParams.toString()}`
    }

    if (page > pagination.totalPages) {
      return res.redirect(pageUrl(pagination.totalPages))
    }

    return res.render('admin/teachers/index', {
      teachers: result.rows,
      status: status ?? '',
      statusList: TEACHER_STATUS_OPTIONS,
      ...getPaginationLinks(pagination, pageUrl)
    })
  },

  getTeacherDetailsPage: async (req, res) => {
    const teacherId = Number(req.params.teacherId)

    if (!Number.isSafeInteger(teacherId) || teacherId < 1) {
      return res.status(400).send('教師 ID 必須是正整數')
    }

    const teacher = await teacherService.getTeacherDetails(teacherId)

    if (!teacher) {
      return res.redirect('/admin/teachers')
    }

    return res.render('admin/teachers/detail', {
      teacher
    })
  },

  getEditTeacherPage: async (req, res) => {
    const teacherId = Number(req.params.teacherId)

    if (!Number.isSafeInteger(teacherId) || teacherId < 1) {
      return res.status(400).send('教師 ID 必須是正整數')
    }

    const teacher = await teacherService.getTeacherDetails(teacherId)

    if (!teacher) {
      return res.redirect('/admin/teachers')
    }

    return res.render('admin/teachers/edit', {
      teacher,
      sexList: SEX_OPTIONS,
      statusList: TEACHER_STATUS_OPTIONS
    })
  },

  updateTeacher: async (req, res) => {
    const teacherId = Number(req.params.teacherId)

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
