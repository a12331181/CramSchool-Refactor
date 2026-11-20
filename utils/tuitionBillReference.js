function getTuitionDocumentNo({ id, draftNo, billNo }) {
  return billNo || draftNo || `#${id}`
}

module.exports = { getTuitionDocumentNo }
