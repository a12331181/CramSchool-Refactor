const { discardUnusedProfileImage } = require('./profileImageService')
const { allocateStudentNo, ReferenceNumberExhaustedError } = require('./referenceNumberService')
const { getConfirmedSessionEnrollment } = require('./courseSessionEnrollmentRules')
const {Student, Course, Enrollment, Calendar, Attend, LegacyTuition, TuitionBill, sequelize} = require('../models')
const { Op } = require('sequelize')
const STUDENT_STATUS = require('../constants/studentStatus')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')
const COURSE_SESSION_STATUS = require('../constants/courseSessionStatus')
const ATTEND_STATUS = require('../constants/attendStatus')
const { getTaipeiDate } = require('../utils/date')

function getStudentReference(studentId, transaction) {
  return Student.findByPk(studentId, { attributes: ['id', 'studentNo', 'name'], raw: true, transaction })
}

async function getStudentDetails(studentId) {
  const student = await Student.findOne({
    include: [{
      model: Course, as: 'EnrolledCourses', where: { isActive: true }, required: false
    }],
    where: {
      id: studentId,
      status: STUDENT_STATUS.ACTIVE
    }
  })

  if (!student) {
    return null
  }

  const { EnrolledCourses: enrolledCourses, ...studentData } = student.toJSON()
  return { student: studentData, enrolledCourses }
}

function studentSearch(query) {
  if (!query) return {}
  return { [Op.or]: ['name', 'studentNo'].map(column =>
    sequelize.where(sequelize.fn('LOCATE', query, sequelize.col('Student.' + column)), { [Op.gt]: 0 })
  ) }
}

async function getStudentsPage({ page, courseId, pageSize, query: search }) {
  const offset = (page - 1) * pageSize

  const query = {
    attributes: ['id', 'studentNo', 'name', 'school', 'grade'],
    raw: true,
    distinct: true,
    where: { status: STUDENT_STATUS.ACTIVE, ...studentSearch(search) },
    order: [['id', 'ASC']],
    limit: pageSize,
    offset
  }

  if (courseId !== undefined) {
    query.include = [{
      model: Course,
      as: 'EnrolledCourses',
      attributes: [],
      through: { attributes: [] },
      where: { id: courseId },
      required: true
    }]
  }

  const [result, courses] = await Promise.all([
    Student.findAndCountAll(query),
    Course.findAll({
      attributes: ['id', 'courseNo', 'name'],
      where: { isActive: true },
      order: [['id', 'ASC']],
      raw: true
    })
  ])

  return {
    rows: result.rows,
    count: result.count,
    courses
  }
}

async function getAdminStudentsPage({ page, pageSize, courseId, query: search }) {
  const query = {
    attributes: ['id', 'studentNo', 'name', 'sex', 'school', 'grade', 'status'],
    where: studentSearch(search),
    order: [
      ['status', 'ASC'],
      ['id', 'ASC']
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  }

  if (courseId !== undefined) {
    query.include = [{
      model: Course,
      as: 'EnrolledCourses',
      attributes: [],
      through: { attributes: [] },
      where: { id: courseId },
      required: true
    }]
  }

  const [result, courses] = await Promise.all([
    Student.findAndCountAll(query),
    Course.findAll({
      attributes: ['id', 'courseNo', 'name'],
      order: [['id', 'ASC']],
      raw: true
    })
  ])

  return {
    rows: result.rows.map(student => student.toJSON()),
    count: result.count,
    courses
  }
}

async function getAdminStudentDetails(studentId) {
  const student = await Student.findByPk(studentId, {
    attributes: [
      'id',
      'studentNo',
      'name',
      'sex',
      'birth',
      'school',
      'grade',
      'tel',
      'address',
      'image',
      'status'
    ],
    raw: true
  })

  return student
}

async function updateStudent(studentId, studentData) {
  if (!Object.values(STUDENT_STATUS).includes(studentData.status)) {
    return {
      updated: false,
      reason: 'INVALID_STATUS'
    }
  }

  let previousImage
  const result = await sequelize.transaction(async transaction => {
    const student = await Student.findByPk(studentId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!student) {
      return {
        updated: false,
        reason: 'STUDENT_NOT_FOUND'
      }
    }

    const endsOn = getTaipeiDate()

    if (studentData.status === STUDENT_STATUS.LEFT) {
      const futureEnrollment = await Enrollment.findOne({
        attributes: ['id'],
        where: {
          StudentId: studentId,
          status: ENROLLMENT_STATUS.ACTIVE,
          startsOn: { [Op.gt]: endsOn }
        },
        transaction
      })

      if (futureEnrollment) {
        return { updated: false, reason: 'FUTURE_ENROLLMENT' }
      }
    }

    const editableFields = [
      'name',
      'sex',
      'birth',
      'school',
      'grade',
      'tel',
      'address',
      'image',
      'status'
    ]

    const updates = {}

    for (const field of editableFields) {
      if (studentData[field] !== undefined) {
        updates[field] = studentData[field]
      }
    }

    if (updates.image !== undefined && updates.image !== student.image) previousImage = student.image
    await student.update(updates, {
      transaction
    })

    if (studentData.status === STUDENT_STATUS.LEFT) {
      await Enrollment.update({
        endsOn,
        status: ENROLLMENT_STATUS.ENDED
      }, {
        where: {
          StudentId: studentId,
          status: ENROLLMENT_STATUS.ACTIVE
        },
        transaction
      })
    }

    return {
      updated: true,
      status: studentData.status
    }
  })
  if (result.updated) await discardUnusedProfileImage(previousImage)
  return result
}

async function createStudent(studentData) {
  if (!Object.values(STUDENT_STATUS).includes(studentData.status)) {
    return {
      created: false,
      reason: 'INVALID_STATUS'
    }
  }

  return sequelize.transaction(async transaction => {
    const studentNo = await allocateStudentNo(transaction)
    const student = await Student.create({
      studentNo,
      name: studentData.name,
      sex: studentData.sex,
      birth: studentData.birth,
      school: studentData.school,
      grade: studentData.grade,
      tel: studentData.tel,
      address: studentData.address,
      image: studentData.image ?? null,
      status: studentData.status
    }, { transaction })

    return { created: true, studentId: student.id, studentNo }
  }).catch(error => {
    if (error instanceof ReferenceNumberExhaustedError) return { created: false, reason: 'STUDENT_NUMBER_EXHAUSTED' }
    throw error
  })
}

async function deleteStudent(studentId) {
  let previousImage
  const result = await sequelize.transaction(async transaction => {
    const student = await Student.findByPk(studentId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!student) {
      return {
        deleted: false,
        reason: 'STUDENT_NOT_FOUND'
      }
    }

    const bill = await TuitionBill.findOne({
      attributes: ['id'],
      where: { StudentId: studentId },
      transaction
    })

    if (bill) {
      return { deleted: false, reason: 'HAS_TUITION_BILLS' }
    }

    const attend = await Attend.findOne({
      attributes: ['id'],
      where: {
        StudentId: studentId
      },
      transaction
    })

    if (attend) {
      return {
        deleted: false,
        reason: 'HAS_ATTENDANCE'
      }
    }

    const legacyCharge = await LegacyTuition.findOne({
      attributes: ['id'],
      where: {
        StudentId: studentId
      },
      transaction
    })

    if (legacyCharge) {
      return {
        deleted: false,
        reason: 'HAS_TUITION'
      }
    }

    const enrollment = await Enrollment.findOne({
      attributes: ['id'],
      where: {
        StudentId: studentId
      },
      transaction
    })

    if (enrollment) {
      return { deleted: false, reason: 'HAS_ENROLLMENTS' }
    }

    previousImage = student.image
    await student.destroy({
      transaction
    })

    return {
      deleted: true
    }
  })
  if (result.deleted) await discardUnusedProfileImage(previousImage)
  return result
}

async function getStudentAttendanceHistory({ courseId, studentId }) {
  const [course, student] = await Promise.all([
    Course.findOne({
      attributes: ['id', 'courseNo', 'name'],
      where: { id: courseId, isActive: true },
      raw: true
    }),
    Student.findOne({
      attributes: ['id', 'studentNo', 'name'],
      where: { id: studentId, status: STUDENT_STATUS.ACTIVE },
      raw: true
    })
  ])

  if (!course || !student) return null

  const [calendars, enrollments] = await Promise.all([
    Calendar.findAll({
      attributes: ['id', 'startAt', 'endAt', 'status', 'content'],
      where: {
        CourseId: courseId,
        status: { [Op.in]: Object.values(COURSE_SESSION_STATUS) },
        startAt: { [Op.ne]: null },
        endAt: { [Op.ne]: null }
      },
      include: [{
        model: Attend,
        attributes: ['id', 'status', 'reason'],
        where: { StudentId: studentId },
        required: false
      }],
      order: [['startAt', 'DESC'], ['id', 'DESC']]
    }),
    Enrollment.findAll({
      attributes: ['startsOn', 'endsOn', 'status'],
      where: {
        CourseId: courseId,
        StudentId: studentId,
        status: { [Op.in]: [ENROLLMENT_STATUS.ACTIVE, ENROLLMENT_STATUS.ENDED] }
      },
      raw: true
    })
  ])

  const now = Date.now()
  const attends = []
  for (const calendar of calendars) {
    const { id, startAt, endAt, status: sessionStatus, content, Attends } = calendar.get({ plain: true })
    if (
      !(startAt instanceof Date) || !Number.isFinite(startAt.getTime()) ||
      !(endAt instanceof Date) || !Number.isFinite(endAt.getTime()) ||
      startAt >= endAt
    ) continue

    const attend = Attends[0]
    const isCancelled = sessionStatus === COURSE_SESSION_STATUS.CANCELLED
    if (!attend) {
      if (isCancelled || endAt.getTime() > now) continue

      const sessionDate = getTaipeiDate(startAt)
      const candidates = enrollments.filter(({ startsOn, endsOn }) =>
        (startsOn == null || startsOn <= sessionDate) &&
        (endsOn == null || endsOn > sessionDate)
      )
      if (!getConfirmedSessionEnrollment(candidates)) continue
    }

    attends.push({
      calendarId: id,
      startAt,
      content,
      status: attend ? attend.status : ATTEND_STATUS.UNMARKED,
      reason: attend?.reason ?? '',
      isCancelled
    })
  }

  return { student, course, attends }
}

module.exports = {
  getStudentReference,
  getStudentAttendanceHistory,
  getStudentDetails,
  getStudentsPage,
  getAdminStudentsPage,
  getAdminStudentDetails,
  updateStudent,
  createStudent,
  deleteStudent
}
