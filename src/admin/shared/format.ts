import type { Locale } from '../../i18n/locale'

/** The mark for "no value". "Unknown" and "0" never share a glyph, so this is the only one used. */
export const EMPTY_MARK = '—'

const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', ko: 'ko-KR' }

export interface AdminFormat {
  count: (value: number) => string
  /** Tokens read by scale, not by digit, so large values are compacted. Put the exact value in `title`. */
  tokens: (value: number) => string
  rate: (rate: number | null) => string
  cost: (value: number | null) => string
  duration: (ms: number | null) => string
  timestamp: (iso: string) => string
}

/**
 * Number and date formatting for the admin screens, in the console's locale.
 *
 * admin-page hard-coded `ko-KR`; the console switches between `en` and `ko`,
 * so each screen asks for the formatter of the current locale.
 */
export function adminFormat(locale: Locale): AdminFormat {
  const tag = INTL_LOCALE[locale]
  const counts = new Intl.NumberFormat(tag)
  const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 })
  const percents = new Intl.NumberFormat(tag, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  const timestamps = new Intl.DateTimeFormat(tag, { dateStyle: 'short', timeStyle: 'medium' })
  const seconds = new Intl.NumberFormat(tag, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'narrow',
    maximumFractionDigits: 1,
  })
  const minutes = new Intl.NumberFormat(tag, { style: 'unit', unit: 'minute', unitDisplay: 'narrow' })

  return {
    count: (value) => counts.format(value),
    tokens: (value) => (value < 10_000 ? counts.format(value) : compact.format(value)),
    rate: (rate) => (rate === null ? EMPTY_MARK : percents.format(rate)),
    cost: formatCost,
    duration: (ms) => {
      if (ms === null) return EMPTY_MARK
      const total = ms / 1000
      if (total < 60) return seconds.format(Math.round(total * 10) / 10)
      const whole = Math.floor(total / 60)
      return `${minutes.format(whole)} ${seconds.format(Math.round(total - whole * 60))}`
    },
    timestamp: (iso) => {
      const date = new Date(iso)
      return Number.isNaN(date.getTime()) ? EMPTY_MARK : timestamps.format(date)
    },
  }
}

/**
 * Cost. null means "unit price unknown", so it is never written as `$0.00`.
 *
 * Four decimals below $1 because one run often costs less than a cent; cutting
 * at two turns most cells into `$0.00` and the comparison is lost.
 */
export function formatCost(value: number | null): string {
  if (value === null) return EMPTY_MARK
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

/** The format `<input type="date">` reads. Local calendar: cutting at UTC shifts the day. */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
