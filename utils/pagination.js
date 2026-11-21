const { readUnsignedInteger } = require('./formNumbers')

function getPagination({ page, pageSize, totalCount }) {
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / pageSize)
  )

  const totalPage = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  )

  return {
    page,
    totalPages,
    totalPage,
    prev: Math.max(1, page - 1),
    next: Math.min(totalPages, page + 1)
  }
}

function getPaginationLinks(pagination, pageUrl) {
  const { page, totalPages, totalPage, prev, next } = pagination

  return {
    pageLinks: totalPage.map(number => ({
      number,
      url: pageUrl(number),
      isCurrent: number === page
    })),
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
