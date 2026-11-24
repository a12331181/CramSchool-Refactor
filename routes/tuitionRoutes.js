const { Router } = require('express')

const tuitionBillController = require('../controllers/tuitionBillController')
const tuitionCashflowController = require('../controllers/tuitionCashflowController')
const tuitionPaymentController = require('../controllers/tuitionPaymentController')
const tuitionPricingController = require('../controllers/tuitionPricingController')
const tuitionReportController = require('../controllers/tuitionReportController')

const { authenticatedAdmin } = require('../middlewares/auth')

const router = Router()

router.get(
  '/tuition/courses/:courseId/monthly',
  authenticatedAdmin,
  tuitionReportController.getCourseMonthlyTuitionPage
)
router.get(
  '/tuition/courses/:courseId/students/:studentId',
  authenticatedAdmin,
  tuitionReportController.getStudentTuitionHistoryPage
)
router.get(
  '/tuition/courses/:courseId/students/:studentId/preview',
  authenticatedAdmin,
  tuitionPricingController.getCourseTuitionPreviewPage
)
router.get(
  '/tuition/students/:studentId/preview',
  authenticatedAdmin,
  tuitionPricingController.getStudentTuitionPreviewPage
)
router.post(
  '/tuition/students/:studentId/leave-reviews/:attendId',
  authenticatedAdmin,
  tuitionPricingController.recordLeaveReview
)
router.get(
  '/tuition/students',
  authenticatedAdmin,
  tuitionReportController.getStudentTuitionListPage
)
router.get(
  '/tuition/students/:studentId/history',
  authenticatedAdmin,
  tuitionReportController.getStudentTuitionHistoryPage
)
router.post(
  '/tuition/students/:studentId/bills/draft',
  authenticatedAdmin,
  tuitionBillController.createTuitionBillDraft
)
router.post(
  '/tuition/students/:studentId/bills/supplement',
  authenticatedAdmin,
  tuitionBillController.createSupplementalTuitionBillDraft
)
router.get(
  '/tuition/bills/:billId',
  authenticatedAdmin,
  tuitionBillController.getTuitionBillDetailsPage
)
router.post(
  '/tuition/bills/:billId/void',
  authenticatedAdmin,
  tuitionBillController.voidIssuedTuitionBill
)
router.post(
  '/tuition/bills/:billId/extra-fees',
  authenticatedAdmin,
  tuitionBillController.addTuitionBillExtraFee
)
router.post(
  '/tuition/bills/:billId/discount',
  authenticatedAdmin,
  tuitionBillController.setTuitionBillDraftDiscount
)
router.post(
  '/tuition/bills/:billId/leave-credits',
  authenticatedAdmin,
  tuitionBillController.addLeaveCreditToDraft
)
router.post(
  '/tuition/bills/:billId/items/:billItemId/remove',
  authenticatedAdmin,
  tuitionBillController.removeTuitionBillDraftAdjustment
)
router.post(
  '/tuition/bills/:billId/refresh',
  authenticatedAdmin,
  tuitionBillController.refreshTuitionBillDraft
)
router.post(
  '/tuition/bills/:billId/discard',
  authenticatedAdmin,
  tuitionBillController.discardTuitionBillDraft
)
router.post(
  '/tuition/bills/:billId/issue',
  authenticatedAdmin,
  tuitionBillController.issueTuitionBill
)
router.get(
  '/tuition/students/:studentId/payment-groups/new',
  authenticatedAdmin,
  tuitionPaymentController.getTuitionPaymentGroupForm
)
router.post(
  '/tuition/students/:studentId/payment-groups',
  authenticatedAdmin,
  tuitionPaymentController.recordTuitionPaymentGroup
)
router.get(
  '/tuition/payment-groups/:paymentGroupId',
  authenticatedAdmin,
  tuitionPaymentController.getTuitionPaymentGroupDetails
)
router.post(
  '/tuition/bills/:billId/payments',
  authenticatedAdmin,
  tuitionPaymentController.recordTuitionBillPayment
)
router.post(
  '/tuition/bills/:billId/refunds',
  authenticatedAdmin,
  tuitionPaymentController.recordTuitionBillRefund
)
router.get('/payment', authenticatedAdmin, tuitionReportController.getCoursePaymentOverviewPage)
router.get('/tuition/cashflow', authenticatedAdmin, tuitionCashflowController.getCashflow)
router.get('/tuition/cashflow.csv', authenticatedAdmin, tuitionCashflowController.getCashflowCsv)

module.exports = router
