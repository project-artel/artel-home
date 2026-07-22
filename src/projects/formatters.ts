/**
 * Shared display helpers.
 *
 * Every one of these degrades quietly: a missing or malformed server value
 * renders as an em dash rather than "Invalid Date" or "NaN B".
 */

/** Exported so callers that render a missing value directly use the same mark. */
export const PLACEHOLDER = '—'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function formatDate(value: string): string {
  if (value.length === 0) return PLACEHOLDER

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? PLACEHOLDER : dateFormatter.format(parsed)
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** For values whose ordering within a day matters, such as a chat transcript. */
export function formatDateTime(value: string): string {
  if (value.length === 0) return PLACEHOLDER

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? PLACEHOLDER : dateTimeFormatter.format(parsed)
}

/** Decimal megabytes, matching how the 50 MB limit is stated to the user. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return PLACEHOLDER
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} KB`
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`
}
