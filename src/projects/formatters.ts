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

/**
 * `12s`, `1m 05s`. For an `EXTRACTING` document (ARTEL-761) — there is no
 * progress to show for a single LLM call, only how long it has been running.
 */
export function formatElapsedSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return PLACEHOLDER
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}
