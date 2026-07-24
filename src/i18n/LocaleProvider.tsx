import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { detectLocale, storeLocale, type Locale } from './locale'
import { LocaleContext } from './LocaleContext'
import { messages } from './messages'

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  // `index.html` ships a static lang; keep it truthful for screen readers and
  // font selection once the real locale is known or changes.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(
    () => ({
      locale,
      setLocale: (next: Locale) => {
        storeLocale(next)
        setLocaleState(next)
      },
      t: messages[locale],
    }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
