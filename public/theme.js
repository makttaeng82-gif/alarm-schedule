(() => {
  const body = document.body
  const button = document.getElementById('theme-toggle')
  const savedTheme = localStorage.getItem('alarm-schedule-theme')

  const applyTheme = (theme) => {
    const isDark = theme !== 'light'
    body.classList.toggle('dark', isDark)
    if (button) {
      button.textContent = isDark ? '☀ 라이트' : '☾ 다크'
      button.setAttribute('aria-label', isDark ? '라이트 모드로 변경' : '다크 모드로 변경')
    }
  }

  applyTheme(savedTheme === 'light' ? 'light' : 'dark')
  button?.addEventListener('click', () => {
    const nextTheme = body.classList.contains('dark') ? 'light' : 'dark'
    localStorage.setItem('alarm-schedule-theme', nextTheme)
    applyTheme(nextTheme)
  })
})()
