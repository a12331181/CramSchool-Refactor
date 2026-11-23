const STUDENT_STATUS = require('./studentStatus')
const TEACHER_STATUS = require('./teacherStatus')

const SEX_OPTIONS = Object.freeze(['男', '女'])
const GRADE_OPTIONS = Object.freeze(['一年級', '二年級', '三年級', '四年級', '五年級', '六年級', '七年級', '八年級', '九年級', '其他'])
const STUDENT_STATUS_OPTIONS = Object.freeze([
  { id: STUDENT_STATUS.ACTIVE, status: '在學' },
  { id: STUDENT_STATUS.LEFT, status: '離開' }
])
const TEACHER_STATUS_OPTIONS = Object.freeze([
  { id: TEACHER_STATUS.ACTIVE, status: '在職' },
  { id: TEACHER_STATUS.ON_LEAVE, status: '留職停薪' },
  { id: TEACHER_STATUS.LEFT, status: '離職' }
])
const TEACHER_PROFILE_FIELDS = Object.freeze(['name', 'sex', 'birth', 'phone', 'address', 'education', 'school'])

module.exports = { SEX_OPTIONS, GRADE_OPTIONS, STUDENT_STATUS_OPTIONS, TEACHER_STATUS_OPTIONS, TEACHER_PROFILE_FIELDS }
