export const LOCALES = ['en', 'ko'] as const

export type Locale = (typeof LOCALES)[number]

/** Shown in the switcher untranslated: each language names itself. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
}

const STORAGE_KEY = 'artel.locale'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * An explicit choice wins over the browser language, so a Korean-browser user
 * who picked English never gets flipped back on reload.
 */
export function detectLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); fall through.
  }

  return window.navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Losing persistence only means the next visit re-detects; not worth surfacing.
  }
}
