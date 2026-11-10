const db = require('../models')
const Course = db.Course
const Student = db.Student
const Payment = db.Payment
const Tuition = db.Tuition
const FeeList = db.FeeList

const schoolController = {
  getPaymentIndexPage: (req, res) => {
    Course.findAll({ 
      where: { isActive: true }
    }).then(courses =>{
      return res.render('payment', { courses: courses })
    })
  },

  getEnrolledStudents: (req, res) => {
    Course.findOne({
      where: { id: req.params.id, isActive: true },
      include: [{ model: Student, as: 'EnrolledStudents' }]
    }).then(course => {
      if (course === null) {
        console.log('Not found!')
        res.redirect('/cramschool/payment')
      } else {
        course = course.toJSON()
        let students = course.EnrolledStudents
        let isStudentNotExist = true
        if (students.length > 0) {
          isStudentNotExist = false
        }
        return res.render('studentspayment', { 
          course: course, 
          students: students,
          isStudentNotExist: isStudentNotExist
        })
      }
    })
  },

  getPayments: (req, res) => {
    Promise.all([
      Tuition.findAll({
        raw: true,
        nest: true,
        where: { 
          StudentId: req.params.studentId, 
          CourseId: req.params.courseId 
        },
        include: { model: Payment }
      }),
      Course.findOne({
        where: { id: req.params.courseId, isActive: true },
      })
    ]).then(([tuition, course]) => {
      if (course === null) {
        console.log('Not found!')
        res.redirect('/cramschool/payment')
      } else {
        Student.findOne({
          where: { 
            id: req.params.studentId, 
            status: 1 
          },
        }).then(student => {
          if (student === null) {
            console.log('Not found!')
            res.redirect('/cramschool/payment')
          } else {
            return res.render('paymentlist', { 
              tuition: tuition, 
              course: course.toJSON(), 
              student: student.toJSON()
            })
          }
        })
      }
    })
  },

  deletePayment: (req, res) => {
    Payment.findByPk(req.params.id,{
      include: [{ model: Tuition, required: true }]
    }).then(payment => {
      Tuition.findByPk(payment.dataValues.Tuition.id).then(tuition => {
        Promise.all([
          FeeList.destroy({
            where: { TuitionId: tuition.dataValues.id }
          }),
          tuition.destroy(),
          payment.destroy()
        ]).then(([destroyFeelists, destroyTuition, destroyPayment]) => {
          if (!payment) {
            return res.status(404).send('找不到可操作的舊制收款紀錄。')
          }
          destroyPayment = destroyPayment.toJSON()
          let courseId = destroyPayment.Tuition.CourseId
          let studentId = destroyPayment.Tuition.StudentId
          let url = '/cramschool/payment/courses/'+ String(courseId) + '/students/'+ String(studentId)
          req.flash('success_messages', '已成功刪除收費紀錄與費用表')
          res.redirect(url)
        })
      })
    })
  },

  paymentPaid: (req, res) => {
    Payment.findByPk(req.params.id,{
      include: [{ model: Tuition, required: true }]
    }).then((payment) => {
      if (!payment) {
        return res.status(404).send('找不到可操作的舊制收款紀錄。')
      }
      payment.update({
        isPaid: true
      }).then((editPayment) => {
        editPayment = editPayment.toJSON()
        let studentId = editPayment.Tuition.StudentId
        let courseId = editPayment.Tuition.CourseId
        let url = '/cramschool/payment/courses/'+ String(courseId) + '/students/'+ String(studentId)
        req.flash('success_messages', '確認收到款項，已更改為已繳費狀態')
        res.redirect(url)
      })
    })
  },
}
module.exports = schoolController