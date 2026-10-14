import { useMemo } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'

/** The qa screen's strings and number formatters, both in the console's current locale. */
export function useQa() {
  const { t, locale } = useI18n()
  const fmt = useMemo(() => adminFormat(locale), [locale])
  return { t: t.adminQa, fmt }
}
