export type Theme = 'light' | 'dark'

const storageKey = 'artel-theme'

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'dark' ? '#090c10' : '#ffffff',
  )
  document.querySelector<HTMLLinkElement>('#app-favicon')?.setAttribute(
    'href',
    theme === 'dark' ? '/favicon-dark.svg' : '/favicon.svg',
  )
  window.localStorage.setItem(storageKey, theme)
}
