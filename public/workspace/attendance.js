(() => {
  const feedback = document.getElementById('attendance-feedback')
  if (!feedback || !window.fetch) return
  document.addEventListener('submit', async event => {
    const form = event.target
    const row = form.closest('tr[id^="roster-"]')
    if (!row) return
    event.preventDefault()
    const button = form.querySelector('button[type="submit"]')
    if (button.disabled) return
    button.disabled = true
    feedback.textContent = '儲存中…'
    try {
      const response = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)) })
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('請重新整理名單，確認登入狀態與點名結果。')
      const result = await response.json()
      feedback.textContent = result.message
      if (!response.ok || !result.ok) return
      const roster = await fetch(location.pathname, { cache: 'no-store' })
      const page = new DOMParser().parseFromString(await roster.text(), 'text/html')
      const replacement = page.getElementById(row.id)
      const count = page.getElementById('roster-remaining')
      if (!replacement || !count) throw new Error('已儲存點名，請重新整理以更新名單。')
      row.replaceWith(replacement)
      document.getElementById('roster-remaining').textContent = count.textContent
      replacement.focus({ preventScroll: true })
    } catch (error) {
      feedback.textContent = error instanceof TypeError ? '連線中斷，請重新整理並核對點名結果。' : error.message
    } finally {
      button.disabled = false
    }
  })
})()
