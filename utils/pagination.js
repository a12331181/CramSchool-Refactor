const { readUnsignedInteger } = require('./formNumbers')

function getPagination({ page, pageSize, totalCount }) {
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / pageSize)
  )

  return {
    page,
    totalPages,
    prev: Math.max(1, page - 1),
    next: Math.min(totalPages, page + 1)
  }
}

function getPaginationLinks(pagination, pageUrl) {
  const { page, totalPages, prev, next } = pagination
  let numbers

  if (totalPages <= 7) {
    numbers = Array.from({ length: totalPages }, (_, index) => index + 1)
  } else if (page <= 4) {
    numbers = [1, 2, 3, 4, 5, null, totalPages]
  } else if (page >= totalPages - 3) {
    numbers = [1, null, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  } else {
    numbers = [1, null, page - 1, page, page + 1, null, totalPages]
  }

  return {
    pageLinks: numbers.map(number => number === null
      ? { isGap: true }
      : { number, url: pageUrl(number), isCurrent: number === page }),
    prevUrl: page > 1 ? pageUrl(prev) : null,
    nextUrl: page < totalPages ? pageUrl(next) : null
  }
}

function getPageOffset(value, pageSize) {
  const text = value ?? '1'
  const page = readUnsignedInteger(text)
  if (!Number.isSafeInteger(page) || page < 1 || text.startsWith('0')) return null
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) return null

  const offset = (page - 1) * pageSize
  return Number.isSafeInteger(offset) ? { page, offset } : null
}

module.exports = {
  getPagination,
  getPaginationLinks,
  getPageOffset
}
