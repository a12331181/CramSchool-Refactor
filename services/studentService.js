const {Student, Course, Enrollment, Attend, Tuition, sequelize} = require('../models')
const STUDENT_STATUS = require('../constants/studentStatus')

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

  const data = student.toJSON()

  return {
    student: data,
    enrolledCourses: data.EnrolledCourses
  }
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
    attributes: ['id', 'name', 'sex', 'school', 'grade', 'status'],
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
      transaction
    })

    if (!student) {
      return {
        updated: false,
        reason: 'STUDENT_NOT_FOUND'
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
      await Enrollment.destroy({
        where: {
          StudentId: studentId
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

  await Student.create({
    name: studentData.name,
    sex: studentData.sex,
    birth: studentData.birth,
    school: studentData.school,
    grade: studentData.grade,
    tel: studentData.tel,
    address: studentData.address,
    image: studentData.image ?? null,
    status: studentData.status
  })

  return {
    created: true
  }
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

    const tuition = await Tuition.findOne({
      attributes: ['id'],
      where: {
        StudentId: studentId
      },
      transaction
    })

    if (tuition) {
      return {
        deleted: false,
        reason: 'HAS_TUITION'
      }
    }

    await Enrollment.destroy({
      where: {
        StudentId: studentId
      },
      transaction
    })

    await student.destroy({
      transaction
    })

    return {
      deleted: true
    }
  })
}

module.exports = {
  getStudentDetails,
  getStudentsPage,
  getAdminStudentsPage,
  getAdminStudentDetails,
  updateStudent,
  createStudent,
  deleteStudent
}