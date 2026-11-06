import { apiFetch } from '../auth/authApi'
import { asRecord, asString, ProjectApiError, readJson } from '../projects/projectApi'
import { grassWindow, type DayTotals } from './grass'

/**
 * Spend over the grass window — one project's, or every project the viewer can see.
 *
 * The same `/api/llm-usage/stats` the admin dashboard reads. With a `projectId`
 * it is narrowed to that project and `byProject` is one row; without one the
 * server sums every project the viewer is a member of, and `byProject` is the
 * per-project list the account's API 관리 tab draws (ARTEL-1393).
 */
export interface ProjectUsage {
  total: UsageTotals
  daily: { date: string; totals: DayTotals }[]
  byService: { service: string; totals: UsageTotals }[]
  byModel: { provider: string; model: string; totals: UsageTotals }[]
  byProject: { projectId: string; projectName: string; totals: UsageTotals }[]
  /** The zone the server cut days in. The graph says which one, so midnight is not a guess. */
  zone: string
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  /** null is "no provider priced these calls" — **not** zero. */
  costUsd: number | null
  calls: number
  /** How many of `calls` the money stands on. Below `calls`, the amount is a floor. */
  pricedCalls: number
}

/**
 * The browser's own zone. The server defaults to UTC, and without this a day in
 * Korea would start at 09:00 — the grass would put nine hours of every morning
 * in the cell before it.
 */
function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/** null stands for "unknown". Only cost needs it; every other field is a count. */
function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = asNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function parseTotals(raw: Record<string, unknown> | null): UsageTotals {
  const r = raw ?? {}
  return {
    inputTokens: asNumber(r.inputTokens, 0),
    outputTokens: asNumber(r.outputTokens, 0),
    cachedInputTokens: asNumber(r.cachedInputTokens, 0),
    reasoningTokens: asNumber(r.reasoningTokens, 0),
    // Never fall to 0 here: "nobody priced this" drawn as "$0.00" makes a real
    // bill look free.
    costUsd: asNullableNumber(r.costUsd),
    calls: asNumber(r.calls, 0),
    pricedCalls: asNumber(r.pricedCalls, 0),
  }
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * @param today the day the window ends on. Passed in rather than read from the
 *   clock so a caller can pin it, and so the request and the grid cannot end up
 *   on two different days when the read straddles midnight.
 */
export async function fetchProjectUsage(projectId: string, today: Date, signal?: AbortSignal): Promise<ProjectUsage> {
  return fetchUsage(projectId, today, signal)
}

/** [projectId] null 이면 볼 수 있는 전 프로젝트 합산이다(ARTEL-1393). */
export async function fetchUsage(
  projectId: string | null,
  today: Date,
  signal?: AbortSignal,
): Promise<ProjectUsage> {
  const { start, end } = grassWindow(today)
  const params = new URLSearchParams({
    from: start.toISOString(),
    // The server's `to` is exclusive, so today is included only by asking for
    // tomorrow's midnight.
    to: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).toISOString(),
    zone: localZone(),
  })
  if (projectId !== null) params.set('projectId', projectId)

  const response = await apiFetch(`/api/llm-usage/stats?${params}`, { signal })
  const body = asRecord(await readJson(response))
  if (body === null) {
    throw new ProjectApiError(response.status, 'The server returned unreadable usage.')
  }

  return {
    zone: asString(body.zone, localZone()),
    total: parseTotals(asRecord(body.total)),
    daily: list(body.daily).flatMap((raw) => {
      const cell = asRecord(raw)
      const date = cell === null ? '' : asString(cell.date, '')
      // A row without a date cannot be placed in the grid. Dropping it loses one
      // day; keeping it would put that day's spend on an arbitrary cell.
      if (cell === null || date === '') return []
      const totals = parseTotals(asRecord(cell.totals))
      return [{ date, totals: totals as DayTotals }]
    }),
    byService: list(body.byService).flatMap((raw) => {
      const cell = asRecord(raw)
      if (cell === null) return []
      return [{ service: asString(cell.service, ''), totals: parseTotals(asRecord(cell.totals)) }]
    }),
    byModel: list(body.byModel).flatMap((raw) => {
      const cell = asRecord(raw)
      if (cell === null) return []
      return [
        {
          provider: asString(cell.provider, ''),
          model: asString(cell.model, ''),
          totals: parseTotals(asRecord(cell.totals)),
        },
      ]
    }),
    byProject: list(body.byProject).flatMap((raw) => {
      const cell = asRecord(raw)
      const projectId = cell === null ? '' : asString(cell.projectId, '')
      if (cell === null || projectId === '') return []
      return [{ projectId, projectName: asString(cell.projectName, ''), totals: parseTotals(asRecord(cell.totals)) }]
    }),
  }
}

/**
 * Service labels.
 *
 * An unknown value is shown as it came. When the server grows a sixth service,
 * a blank label would turn that spend into a nameless row rather than a new one.
 */
export function serviceLabel(service: string, labels: Record<string, string>): string {
  return labels[service] ?? service
}
