import { createContext } from 'react'
import type { Locale } from './locale'
import type { Messages } from './messages'

export type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Messages
}

export const LocaleContext = createContext<I18nContextValue | null>(null)
