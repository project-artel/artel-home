export type Theme = 'light' | 'dark'

const COOKIE_NAME = 'artel-theme'

/**
 * console.artel.kr and admin.artel.kr are one product to the user, so the
 * choice is stored on the parent domain rather than per origin — localStorage
 * cannot cross that hop. Anywhere else (localhost, preview builds) the cookie
 * stays host-only, which still shares it across dev ports since cookies ignore
 * the port.
 */
const SHARED_DOMAIN = 'artel.kr'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'dark' ? '#14161c' : '#F7F4EE',
  )
  document.querySelector<HTMLLinkElement>('#app-favicon')?.setAttribute(
    'href',
    theme === 'dark' ? '/favicon-dark.svg' : '/favicon.svg',
  )
  persistTheme(theme)
}

export function persistTheme(theme: Theme) {
  const { hostname, protocol } = window.location
  const onSharedDomain = hostname === SHARED_DOMAIN || hostname.endsWith(`.${SHARED_DOMAIN}`)
  const domain = onSharedDomain ? `; Domain=.${SHARED_DOMAIN}` : ''
  const secure = protocol === 'https:' ? '; Secure' : ''

  document.cookie =
    `${COOKIE_NAME}=${theme}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${domain}${secure}`
}
