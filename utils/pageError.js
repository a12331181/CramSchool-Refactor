function wantsHtmlPage(req) {
  const accepts = req.get('Accept') ?? ''
  return accepts.toLowerCase().includes('text/html') &&
    req.accepts(['html', 'text', 'json']) === 'html'
}

function sendPageError(res, status, message) {
  res.vary('Accept')
  if (!wantsHtmlPage(res.req)) {
    return message === undefined ? res.sendStatus(status) : res.status(status).send(message)
  }

  const signedIn = Boolean(res.req.user)
  return res.status(status).type('html').render('errors/status', {
    layout: signedIn ? 'workspace' : 'access',
    workspaceTitle: '操作提示',
    message: message ?? '你目前沒有權限執行這個操作。',
    status,
    signedIn
  })
}

module.exports = { sendPageError, wantsHtmlPage }
