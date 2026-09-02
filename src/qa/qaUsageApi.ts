import { apiFetch } from '../auth/authApi'
import { asRecord, ProjectApiError, readJson } from '../projects/projectApi'

/**
 * What one QA run spent.
 *
 * `costUsd` is null when no call on the run carried a unit price — **not zero**.
 * Some providers never report one, and drawing both as `$0.00` turns "nobody
 * said" into "this was free".
 *
 * `pricedCalls` says how many of `calls` the money stands on. When it is lower,
 * the amount is a floor, and the screen has to say so.
 */
export interface QaRunUsage {
  qaTryId: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  costUsd: number | null
  calls: number
  pricedCalls: number
}

/**
 * Numbers arrive as JSON numbers today, but `cost_usd` is `NUMERIC` on the
 * server and a serializer change would send it as a string. Falling to 0 there
 * would quietly turn real spend into free.
 */
function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/** null stands for "unknown", not "zero". Cost is the only field that needs it. */
function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = asNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * One run's spend. Answers 404 when the run is gone or out of reach.
 *
 * Not part of `getQaTry`: usage reaches the server in batches the agent sends
 * after the fact, so it settles on a different clock than the run row. Folding
 * it into the run response would make every poll of the run carry an aggregate
 * that only changes minutes later.
 */
export async function getQaRunUsage(
  qaTryId: string,
  signal?: AbortSignal,
): Promise<QaRunUsage | null> {
  const response = await apiFetch(`/api/llm-usage/qa-runs/${encodeURIComponent(qaTryId)}`, {
    signal,
  })
  if (response.status === 404) return null

  const body = asRecord(await readJson(response))
  const totals = body === null ? null : asRecord(body.totals)
  if (body === null || totals === null) {
    throw new ProjectApiError(response.status, 'The server returned unreadable usage.')
  }

  return {
    qaTryId,
    inputTokens: asNumber(totals.inputTokens, 0),
    outputTokens: asNumber(totals.outputTokens, 0),
    cachedInputTokens: asNumber(totals.cachedInputTokens, 0),
    reasoningTokens: asNumber(totals.reasoningTokens, 0),
    costUsd: asNullableNumber(totals.costUsd),
    calls: asNumber(totals.calls, 0),
    pricedCalls: asNumber(totals.pricedCalls, 0),
  }
}

/**
 * Tokens this run used.
 *
 * Cached input and reasoning are left out: the provider already counts them
 * inside input and output. Adding them would count the same tokens twice and
 * put a number on screen that does not match the bill.
 */
export function usedTokens(usage: QaRunUsage): number {
  return usage.inputTokens + usage.outputTokens
}
