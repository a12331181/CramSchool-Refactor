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
    totalPage,
    prev: Math.max(1, page - 1),
    next: Math.min(totalPages, page + 1)
  }
}

module.exports = {
  getPagination
}