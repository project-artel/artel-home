import type { UsageTotals } from './usageApi'

/**
 * Four decimals below a dollar. A day of light use is often under a cent, and
 * two decimals would print `$0.00` for exactly the days worth comparing.
 *
 * @param unknown what to print when no provider priced the calls. **Not** `$0.00` —
 *   "nobody said" and "this was free" must not share a string.
 */
export function formatCost(value: number | null, unknown: string): string {
  if (value === null) return unknown
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

/** Tokens a bucket used. Cached input and reasoning already sit inside these two. */
export function totalTokens(totals: UsageTotals): number {
  return totals.inputTokens + totals.outputTokens
}
