const db = require('../models')
const Course = db.Course
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
        ]).then(() => {
          if (!payment) {
            return res.status(404).send('找不到可操作的舊制收款紀錄。')
          }
          req.flash('success_messages', '已成功刪除收費紀錄與費用表')
          res.redirect('/cramschool/payment')
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
      }).then(() => {
        req.flash('success_messages', '確認收到款項，已更改為已繳費狀態')
        res.redirect('/cramschool/payment')
      })
    })
  },
}
module.exports = schoolController