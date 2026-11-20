const { TuitionBill, TuitionBillItem } = require('../models')
const COURSE_FEE_TYPES = require('../constants/courseOptions').COURSE_TYPES
const TUITION_BILL_STATUS = require('../constants/tuitionBillStatus')
const TUITION_BILL_ITEM_KIND = require('../constants/tuitionBillItemKind')

const isId = value => Number.isSafeInteger(value) && value > 0

async function getIssuedCourseFees({ studentId, billingMonth }, transaction) {
  return TuitionBillItem.findAll({
    attributes: ['CourseId', 'quantity', 'sourceSnapshot'],
    where: { kind: TUITION_BILL_ITEM_KIND.COURSE_FEE },
    include: [{
      model: TuitionBill,
      attributes: [],
      where: { StudentId: studentId, billingMonth, status: TUITION_BILL_STATUS.ISSUED },
      required: true
    }],
    raw: true,
    transaction
  })
}

function excludeIssuedCourseFees(preview, issuedFees) {
  if (!preview.ok) return preview

  const byCourse = new Map()
  for (const item of issuedFees) {
    if (!isId(item.CourseId)) return { ok: false, code: 'ISSUED_COURSE_FEES_REQUIRE_REVIEW' }
    const group = byCourse.get(item.CourseId) ?? []
    group.push(item)
    byCourse.set(item.CourseId, group)
  }

  const courses = []
  const reviewItems = [...preview.reviewItems]
  for (const entry of preview.courses) {
    const { id: courseId, type } = entry.course
    const prior = byCourse.get(courseId)
    if (!prior) {
      courses.push(entry)
      continue
    }

    if (prior.some(item => item.sourceSnapshot?.billingType !== type)) {
      reviewItems.push({ courseId, code: 'ISSUED_COURSE_FEES_REQUIRE_REVIEW' })
      continue
    }

    if (type === COURSE_FEE_TYPES.MONTHLY) {
      if (prior.length !== 1 || prior[0].quantity !== 1) {
        reviewItems.push({ courseId, code: 'ISSUED_COURSE_FEES_REQUIRE_REVIEW' })
      }
      continue
    }

    const covered = new Set()
    let valid = true
    for (const item of prior) {
      const snapshot = item.sourceSnapshot
      if (!Array.isArray(snapshot.calendars) || snapshot.calendars.length !== item.quantity ||
          snapshot.billableCount !== item.quantity) {
        valid = false
        break
      }
      for (const lesson of snapshot.calendars) {
        const id = lesson?.calendarId
        if (!isId(id) || covered.has(id)) {
          valid = false
          break
        }
        covered.add(id)
      }
      if (!valid) break
    }

    if (!valid) {
      reviewItems.push({ courseId, code: 'ISSUED_COURSE_FEES_REQUIRE_REVIEW' })
      continue
    }

    const calendars = entry.calendars.filter(lesson => !covered.has(lesson.id))
    if (calendars.length === 0) continue

    const quantity = calendars.length
    courses.push({
      ...entry, calendars, billableCount: quantity, quantity, baseAmount: quantity * entry.unitPrice
    })
  }

  return { ...preview, courses, reviewItems }
}

module.exports = { getIssuedCourseFees, excludeIssuedCourseFees }
