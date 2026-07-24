import { apiFetch, orchestrationUrlFor } from '../auth/authApi'
import {
  asNullableString,
  asRecord,
  asString,
  ProjectApiError,
  readJson,
} from '../projects/projectApi'
import {
  QA_LOG_DIRECTIONS,
  QA_LOG_TYPES,
  QA_TRY_STATUSES,
  type QaLog,
  type QaLogDirection,
  type QaLogPage,
  type QaLogType,
  type QaTry,
  type QaTryStatus,
} from './qaTypes'

const QA_ROOT = '/api/qa-tries'
const DECIMAL_ID = /^\d+$/

export function isDecimalId(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_ID.test(value)
}

function requiredId(value: unknown, field: string, status: number): string {
  if (!isDecimalId(value)) {
    throw new ProjectApiError(status, `The server returned an invalid ${field}.`)
  }
  return value
}

function optionalId(value: unknown): string | null {
  return isDecimalId(value) ? value : null
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.some((candidate) => candidate === value)
}

function parseStatus(value: unknown, status: number): QaTryStatus {
  if (!isOneOf(value, QA_TRY_STATUSES)) {
    throw new ProjectApiError(status, 'The server returned an unknown QA Try status.')
  }
  return value
}

function parseDirection(value: unknown): QaLogDirection | null {
  return isOneOf(value, QA_LOG_DIRECTIONS) ? value : null
}

function parseLogType(value: unknown): QaLogType | null {
  return isOneOf(value, QA_LOG_TYPES) ? value : null
}

export function parseQaTry(data: unknown, status = 200): QaTry {
  const record = asRecord(data)
  if (record === null) {
    throw new ProjectApiError(status, 'The server returned an unreadable QA Try.')
  }

  return {
    id: requiredId(record.id, 'QA Try id', status),
    testScenarioId: requiredId(record.testScenarioId, 'test scenario id', status),
    gameInstanceId: requiredId(record.gameInstanceId, 'game instance id', status),
    agentSessionId: optionalId(record.agentSessionId),
    status: parseStatus(record.status, status),
    startedAt: asNullableString(record.startedAt),
    completedAt: asNullableString(record.completedAt),
  }
}

export function parseQaLog(data: unknown): QaLog | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = isDecimalId(record.id) ? record.id : null
  const qaTryId = isDecimalId(record.qaTryId) ? record.qaTryId : null
  const direction = parseDirection(record.direction)
  const type = parseLogType(record.type)
  if (id === null || qaTryId === null || direction === null || type === null) return null

  return {
    id,
    qaTryId,
    messageId: optionalId(record.messageId),
    correlationId: optionalId(record.correlationId),
    direction,
    type,
    message: asString(record.message),
    payload: record.payload ?? null,
    createdAt: asString(record.createdAt),
  }
}

function parseLogPage(data: unknown, status: number): QaLogPage {
  const record = asRecord(data)
  if (record === null || !Array.isArray(record.items)) {
    throw new ProjectApiError(status, 'The server returned an unreadable QA log page.')
  }

  return {
    items: record.items
      .map((item) => parseQaLog(item))
      .filter((item): item is QaLog => item !== null),
    nextBeforeId: optionalId(record.nextBeforeId),
    hasMore: record.hasMore === true,
  }
}

function qaPath(qaTryId: string, suffix = ''): string {
  return `${QA_ROOT}/${encodeURIComponent(qaTryId)}${suffix}`
}

export async function getQaTry(qaTryId: string, signal?: AbortSignal): Promise<QaTry> {
  const response = await apiFetch(qaPath(qaTryId), { signal })
  return parseQaTry(await readJson(response), response.status)
}

export async function listQaLogs(
  qaTryId: string,
  beforeId?: string,
  signal?: AbortSignal,
): Promise<QaLogPage> {
  const params = new URLSearchParams({ size: '50' })
  if (beforeId !== undefined) params.set('beforeId', beforeId)

  const response = await apiFetch(`${qaPath(qaTryId, '/logs')}?${params}`, { signal })
  return parseLogPage(await readJson(response), response.status)
}

export function qaEventsUrl(qaTryId: string, afterId?: string): string {
  const params = new URLSearchParams()
  if (afterId !== undefined) params.set('afterId', afterId)
  const query = params.size > 0 ? `?${params}` : ''
  return orchestrationUrlFor(`${qaPath(qaTryId, '/events')}${query}`)
}

export function parseQaLogEvent(data: string): QaLog | null {
  try {
    return parseQaLog(JSON.parse(data))
  } catch {
    return null
  }
}

export function compareDecimalIds(left: string, right: string): number {
  const leftId = BigInt(left)
  const rightId = BigInt(right)
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
}
