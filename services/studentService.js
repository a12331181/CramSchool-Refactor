const { allocateStudentNo, ReferenceNumberExhaustedError } = require('./referenceNumberService')
const {Student, Course, Enrollment, Calendar, Attend, LegacyTuition, TuitionBill, sequelize} = require('../models')
const { Op } = require('sequelize')
const STUDENT_STATUS = require('../constants/studentStatus')
const ENROLLMENT_STATUS = require('../constants/enrollmentStatus')
const { getTaipeiDate } = require('../utils/date')

function getStudentReference(studentId, transaction) {
  return Student.findByPk(studentId, { attributes: ['id', 'studentNo', 'name'], raw: true, transaction })
}

async function getStudentDetails(studentId) {
  const student = await Student.findOne({
    include: [{ model: Course, as: 'EnrolledCourses' }],
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

async function getStudentsPage({ page, courseId, pageSize }) {
  const offset = (page - 1) * pageSize

  const query = {
    raw: true,
    nest: true,
    distinct: true,
    where: { status: STUDENT_STATUS.ACTIVE },
    order: [['id', 'ASC']],
    limit: pageSize,
    offset
  }

  if (courseId !== undefined) {
    query.include = [{
      model: Course,
      as: 'EnrolledCourses',
      where: { id: courseId }
    }]
  }

  const result = await Student.findAndCountAll(query)

  const courses = await Course.findAll({
    where: { isActive: true },
    raw: true
  })

  return {
    rows: result.rows,
    count: result.count,
    courses
  }
}

async function getAdminStudentsPage({ page, pageSize, courseId }) {
  const query = {
    attributes: ['id', 'studentNo', 'name', 'sex', 'school', 'grade', 'status'],
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

  const result = await Student.findAndCountAll(query)

  const courses = await Course.findAll({
    attributes: ['id', 'name'],
    order: [['id', 'ASC']],
    raw: true
  })

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

  return sequelize.transaction(async transaction => {
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
  return sequelize.transaction(async transaction => {
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

    await student.destroy({
      transaction
    })

    return {
      deleted: true
    }
  })
}

async function getStudentAttendanceHistory({ courseId, studentId }) {
  const [course, student, currentPeriod] = await Promise.all([
    Course.findOne({ where: { id: courseId, isActive: true } }),
    Student.findOne({ where: { id: studentId, status: STUDENT_STATUS.ACTIVE } }),
    Calendar.max('period', { where: { CourseId: courseId } })
  ])

  if (!course || !student) return null

  const calendars = await Calendar.findAll({
    where: { CourseId: courseId, period: currentPeriod },
    attributes: ['id', 'date', 'content'],
    include: [{
      model: Attend,
      attributes: ['id', 'isAttend', 'reason'],
      where: { StudentId: studentId },
      required: true
    }],
    order: [['id', 'ASC']]
  })
  const attends = calendars.map(calendar => {
    const { date, content, Attends: [attend] } = calendar.toJSON()
    return { id: attend.id, date, content, isAttend: attend.isAttend, reason: attend.reason }
  })

  return {
    student: student.toJSON(),
    course: course.toJSON(),
    attends,
    currentPeriod
  }
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