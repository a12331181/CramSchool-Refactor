const field = document.querySelector('#content')
const attachments = document.querySelector('#attachments')
const picture = document.querySelector('#record-picture')
attachments.addEventListener('change', () => {
  picture.replaceChildren(new Option('選擇圖片', ''))
  Array.from(attachments.files).forEach((file, index) => {
    if (/\.(jpg|jpeg|png)$/i.test(file.name)) picture.add(new Option(file.name, String(index + 1)))
  })
  if (picture.options.length > 1) picture.selectedIndex = 1
})
for (const button of document.querySelectorAll('[data-record-style]')) {
  button.addEventListener('click', () => {
    const selected = field.value.slice(field.selectionStart, field.selectionEnd)
    let replacement
    if (button.dataset.recordStyle === 'image') {
      if (!picture.value) { attachments.focus(); attachments.click(); return }
      replacement = '[[圖片' + picture.value + ']]'
    } else if (button.dataset.recordStyle === 'bold') replacement = '**' + (selected || '文字') + '**'
    else replacement = (field.selectionStart && !field.value.slice(0,field.selectionStart).endsWith('\n') ? '\n' : '') +
      (selected || '項目').split('\n').map(line => '- ' + line).join('\n')
    field.setRangeText(replacement, field.selectionStart, field.selectionEnd, 'end')
    field.focus()
  })
}
