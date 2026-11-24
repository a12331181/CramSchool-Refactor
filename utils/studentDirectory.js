function studentDirectoryQuery(query) {
  const params = new URLSearchParams()
  if (/^[1-9]\d{0,12}$/.test(String(query.page || ''))) params.set('page', String(query.page))
  if (/^[1-9]\d{0,12}$/.test(String(query.courseId || ''))) params.set('courseId', String(query.courseId))
  if (typeof query.q === 'string' && query.q.trim()) params.set('q', query.q.trim().slice(0, 80))
  return params.toString()
}

module.exports = { studentDirectoryQuery }
