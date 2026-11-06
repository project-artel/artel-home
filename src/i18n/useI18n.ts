import { useContext } from 'react'
import { LocaleContext } from './LocaleContext'

export function useI18n() {
  const context = useContext(LocaleContext)

  if (!context) {
    throw new Error('useI18n must be used within LocaleProvider')
  }

  return context
}
