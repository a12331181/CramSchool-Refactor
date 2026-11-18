const db = require('../models')
const Payment = db.Payment
const Tuition = db.Tuition
const FeeList = db.FeeList
const tuitionService = require('../services/tuitionService')
const { getTaipeiDate } = require('../utils/date')

const collectionLabels = {
  paid: ['已收齊', 'text-success'],
  unpaid: ['未收齊', 'text-danger'],
  unissued: ['部分未出帳', 'alert-warning px-1 rounded'],
  empty: ['本月無收費資料', 'text-muted'],
  review: ['待核對', 'text-muted']
}

const amountFormat = new Intl.NumberFormat('zh-TW')

const schoolController = {
  getPaymentIndexPage: async (req, res) => {
    const billingMonth = getTaipeiDate().slice(0, 7)
    res.set('Cache-Control', 'no-store')
    const result = await tuitionService.getCoursePaymentOverview({ billingMonth })
    if (!result.ok) return res.status(500).send('無法取得本月課程收費資料。')

    const courses = result.courses.map(course => {
      const [collectionText, collectionClass] = collectionLabels[course.collectionStatus]
      return {
        id: course.id,
        name: course.name,
        receivableText: course.receivableAmount === null
          ? '待核對'
          : `NT$ ${amountFormat.format(course.receivableAmount)}`,
        collectionText,
        collectionClass,
        detailUrl: `/cramschool/tuition/courses/${course.id}/monthly?billingMonth=${billingMonth}`
      }
    })

    return res.render('tuition/course-overview', { billingMonth, courses })
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