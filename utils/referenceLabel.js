function formatReferenceLabel(number, name) {
  if (typeof name !== 'string' || name.trim() === '') return number || '—'
  return typeof number === 'string' && number !== '' ? `${number}｜${name}` : name
}

module.exports = { formatReferenceLabel }
