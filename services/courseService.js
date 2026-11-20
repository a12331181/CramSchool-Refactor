const { getTeacherAccountInclude } = require('./teacherService')
const { allocateCourseNo, ReferenceNumberExhaustedError } = require('./referenceNumberService')
const {Course, Teacher, Student, Calendar, Enrollment, LegacyTuition, TuitionBillItem, Diary, Attend, sequelize} = require('../models')
const { COURSE_TIMES, COURSE_TYPES, MAX_COURSE_PRICE } = require('../constants/courseOptions')
const { Op } = require('sequelize')
const STUDENT_STATUS = require('../constants/studentStatus')

async function getCourseDirectory(userId) {
  const [courses, teacher] = await Promise.all([
    Course.findAll({
      attributes: ['id', 'courseNo', 'name', 'time'],
      where: { isActive: true },
      include: [{ model: Teacher, attributes: ['id', 'name'], include: [getTeacherAccountInclude()] }],
      raw: true,
      nest: true
    }),
    Teacher.findOne({ attributes: ['id'], where: { UserId: userId }, raw: true })
  ])

  return courses.map(course => ({
    ...course,
    canViewDiaries: teacher != null && course.Teacher?.id === teacher.id
  }))
}

async function getCourseEnrolledStudents(courseId) {
  const course = await Course.findOne({
    attributes: ['id', 'courseNo', 'name'],
    where: { id: courseId, isActive: true },
    include: [{
      model: Student,
      as: 'EnrolledStudents',
      attributes: ['id', 'studentNo', 'name', 'school', 'grade'],
      where: { status: STUDENT_STATUS.ACTIVE },
      through: { attributes: [] },
      required: false
    }]
  })

  if (!course) return null
  const { EnrolledStudents: students, ...courseData } = course.toJSON()
  return { course: courseData, students }
}

async function getAdminCoursesPage({ page, pageSize }) {
  const result = await Course.findAndCountAll({
    attributes: [
      'id',
      'courseNo',
      'name',
      'time',
      'type',
      'price',
      'TeacherId',
      'isActive'
    ],
    include: [{
      model: Teacher,
      attributes: ['id', 'name'],
      include: [getTeacherAccountInclude()],
      required: false
    }],
    order: [
      ['isActive', 'DESC'],
      ['id', 'ASC']
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize
  })

  return {
    rows: result.rows.map(course => course.toJSON()),
    count: result.count
  }
}

async function getCourseFormData() {
  const teachers = await Teacher.findAll({
    attributes: ['id', 'name'],
    include: [getTeacherAccountInclude()],
    order: [['id', 'ASC']],
    raw: true,
    nest: true
  })

  return {
    teachers
  }
}

function getCourseSettingsError({ time, type, price, teacherId }) {
  if (!Object.values(COURSE_TIMES).includes(time)) return 'INVALID_TIME'
  if (!Object.values(COURSE_TYPES).includes(type)) return 'INVALID_TYPE'
  if (!Number.isSafeInteger(price) || price < 0 || price > MAX_COURSE_PRICE) return 'INVALID_PRICE'
  if (!Number.isSafeInteger(teacherId) || teacherId < 1) return 'INVALID_TEACHER_ID'
  return null
}

async function createCourse(courseData = {}) {
  const {
    name,
    time,
    type,
    price,
    teacherId,
    coursePrefix
  } = courseData

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 255
  ) {
    return { created: false, reason: 'INVALID_NAME' }
  }

  if (typeof coursePrefix !== 'string' || coursePrefix.length !== 2 || !/^[A-Z]{2}$/.test(coursePrefix)) {
    return { created: false, reason: 'INVALID_COURSE_PREFIX' }
  }

  const reason = getCourseSettingsError(courseData)
  if (reason) return { created: false, reason }

  return sequelize.transaction(async transaction => {
    const teacher = await Teacher.findByPk(teacherId, {
      attributes: ['id'],
      transaction
    })

    if (!teacher) {
      return { created: false, reason: 'TEACHER_NOT_FOUND' }
    }

    const courseNo = await allocateCourseNo(coursePrefix, transaction)
    const course = await Course.create({
      courseNo,
      name: name.trim(),
      time,
      type,
      price,
      TeacherId: teacherId,
      isActive: true
    }, { transaction })

    return { created: true, courseId: course.id, courseNo }
  }).catch(error => {
    if (error instanceof ReferenceNumberExhaustedError) return { created: false, reason: 'COURSE_NUMBER_EXHAUSTED' }
    throw error
  })
}

async function getCourseEditData(courseId) {
  const course = await Course.findByPk(courseId, {
    attributes: [
      'id',
      'courseNo',
      'name',
      'time',
      'type',
      'price',
      'TeacherId',
      'isActive'
    ]
  })

  if (!course || course.isActive === false) {
    return null
  }

  const formData = await getCourseFormData()

  return {
    course: course.toJSON(),
    teachers: formData.teachers
  }
}

async function updateCourse(courseId, courseData = {}) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) return { ok: false, code: 'INVALID_COURSE_ID' }

  const code = getCourseSettingsError(courseData)
  if (code) return { ok: false, code }

  return sequelize.transaction(async transaction => {
    const course = await Course.findByPk(courseId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!course) {
      return {
        ok: false,
        code: 'COURSE_NOT_FOUND'
      }
    }

    if (course.isActive === false) {
      return {
        ok: false,
        code: 'COURSE_CLOSED'
      }
    }

    const teacher = await Teacher.findByPk(courseData.teacherId, {
      attributes: ['id'],
      transaction
    })

    if (!teacher) {
      return {
        ok: false,
        code: 'TEACHER_NOT_FOUND'
      }
    }

    await course.update({
      time: courseData.time,
      type: courseData.type,
      price: courseData.price,
      TeacherId: courseData.teacherId
    }, { transaction })

    return {
      ok: true,
      data: {
        id: course.id
      }
    }
  })
}

async function deleteCourse(courseId) {
  return sequelize.transaction(async transaction => {
    const course = await Course.findByPk(courseId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!course) {
      return { ok: false, code: 'COURSE_NOT_FOUND' }
    }

    const billItem = await TuitionBillItem.findOne({
      attributes: ['id'],
      where: { CourseId: courseId },
      transaction
    })

    if (billItem) {
      return { ok: false, code: 'COURSE_HAS_TUITION_BILL_ITEMS' }
    }

    const calendarWithSessionData = await Calendar.findOne({
      attributes: ['id'],
      where: {
        CourseId: courseId,
        [Op.or]: [
          { status: { [Op.ne]: null } },
          { startAt: { [Op.ne]: null } },
          { endAt: { [Op.ne]: null } },
          { TeacherId: { [Op.ne]: null } }
        ]
      },
      transaction
    })

    if (calendarWithSessionData) {
      return {
        ok: false,
        code: 'COURSE_HAS_SESSION_RECORDS'
      }
    }
    
    const enrollment = await Enrollment.findOne({
      attributes: ['id'],
      where: { CourseId: courseId },
      transaction
    })

    if (enrollment) {
      return { ok: false, code: 'COURSE_HAS_ENROLLMENTS' }
    }

    const legacyCharge = await LegacyTuition.findOne({
      attributes: ['id'],
      where: { CourseId: courseId },
      transaction
    })

    if (legacyCharge) {
      return { ok: false, code: 'COURSE_HAS_TUITIONS' }
    }

    const diary = await Diary.findOne({
      attributes: ['id'],
      where: { CourseId: courseId },
      transaction
    })

    if (diary) {
      return { ok: false, code: 'COURSE_HAS_DIARIES' }
    }

    const closedCalendar = await Calendar.findOne({
      attributes: ['id'],
      where: {
        CourseId: courseId,
        isActive: false
      },
      transaction
    })

    if (closedCalendar) {
      return {
        ok: false,
        code: 'COURSE_HAS_CLOSED_CALENDARS'
      }
    }

    const attend = await Attend.findOne({
      attributes: ['id'],
      include: [{
        model: Calendar,
        attributes: [],
        where: { CourseId: courseId },
        required: true
      }],
      transaction
    })

    if (attend) {
      return { ok: false, code: 'COURSE_HAS_ATTENDANCE' }
    }

    await Calendar.destroy({
      where: { CourseId: courseId },
      transaction
    })

    await course.destroy({ transaction })

    return { ok: true }
  })
}

async function setCourseActive(courseId, isActive) {
  if (typeof isActive !== 'boolean') {
    throw new TypeError('課程狀態必須是布林值')
  }

  return sequelize.transaction(async transaction => {
    const course = await Course.findByPk(courseId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!course) {
      return {
        ok: false,
        code: 'COURSE_NOT_FOUND'
      }
    }

    if (course.isActive === isActive) {
      return {
        ok: true,
        changed: false
      }
    }

    await course.update(
      { isActive },
      { transaction }
    )

    return {
      ok: true,
      changed: true
    }
  })
}

module.exports = {
  getCourseDirectory,
  getCourseEnrolledStudents,
  getAdminCoursesPage,
  getCourseFormData,
  createCourse,
  getCourseEditData,
  updateCourse,
  deleteCourse,
  setCourseActive
}