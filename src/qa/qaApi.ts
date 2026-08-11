import { apiFetch, orchestrationUrlFor } from '../auth/authApi'
import {
  asNullableString,
  asRecord,
  asString,
  isOneOf,
  jsonRequest,
  ProjectApiError,
  readJson,
  toApiError,
} from '../projects/projectApi'
import {
  QA_LOG_DIRECTIONS,
  QA_LOG_TYPES,
  QA_TRY_STATUSES,
  type QaLog,
  type QaLogDirection,
  type QaLogPage,
  type QaLogType,
  type QaModel,
  type QaReasoningSelection,
  type QaRun,
  type QaTry,
  type QaTryStatus,
} from './qaTypes'

const QA_ROOT = '/api/qa-tries'
const QA_RUNS_ROOT = '/api/qa-runs'
const QA_MODELS_ROOT = '/api/qa-models'
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
    // Not decimal ids: Agent-originated frames carry UUIDs here, so running them
    // through optionalId's digits-only test would blank every Agent row.
    messageId: asNullableString(record.messageId),
    correlationId: asNullableString(record.correlationId),
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

/**
 * Starts a QA Try. Both ids must belong to the same project.
 *
 * The server answers `409` for the two preconditions a user can act on: the
 * game instance has no SDK connected, and the instance already has a run in
 * flight. Callers distinguish them with {@link isQaConflict}, since the two need
 * different guidance.
 */
export async function createQaTry(
  testScenarioId: string,
  gameInstanceId: string,
  model: string,
  reasoning: QaReasoningSelection | null,
): Promise<QaTry> {
  const response = await apiFetch(QA_ROOT, {
    method: 'POST',
    ...jsonRequest({ testScenarioId, gameInstanceId, model, reasoning }),
  })
  return parseQaTry(await readJson(response), response.status)
}

/** Parses a QA_Run: the run's own status plus one resolved `QaTry` per scenario. */
export function parseQaRun(data: unknown, status = 200): QaRun {
  const record = asRecord(data)
  if (record === null) {
    throw new ProjectApiError(status, 'The server returned an unreadable QA Run.')
  }
  const tries = Array.isArray(record.tries)
    ? record.tries.map((entry) => parseQaTry(entry, status))
    : []
  return {
    id: requiredId(record.id, 'QA Run id', status),
    testRunId: requiredId(record.testRunId, 'test run id', status),
    gameInstanceId: requiredId(record.gameInstanceId, 'game instance id', status),
    status: parseStatus(record.status, status),
    startedAt: asNullableString(record.startedAt),
    completedAt: asNullableString(record.completedAt),
    tries,
  }
}

/** `POST /api/qa-runs` — start a TR-unit run (all its scenarios, in order). */
export async function createQaRun(
  testRunId: string,
  gameInstanceId: string,
  model: string,
  reasoning: QaReasoningSelection | null,
): Promise<QaRun> {
  const response = await apiFetch(QA_RUNS_ROOT, {
    method: 'POST',
    ...jsonRequest({ testRunId, gameInstanceId, model, reasoning }),
  })
  return parseQaRun(await readJson(response), response.status)
}

/** `GET /api/qa-runs/{id}` — the run overview: status + each scenario's try. */
export async function getQaRun(qaRunId: string, signal?: AbortSignal): Promise<QaRun> {
  const response = await apiFetch(`${QA_RUNS_ROOT}/${encodeURIComponent(qaRunId)}`, { signal })
  return parseQaRun(await readJson(response), response.status)
}

/** `POST /api/qa-runs/{id}/cancel` — cancel the whole run. */
export async function cancelQaRun(qaRunId: string): Promise<void> {
  const response = await apiFetch(
    `${QA_RUNS_ROOT}/${encodeURIComponent(qaRunId)}/cancel`,
    { method: 'POST' },
  )
  if (!response.ok) throw await toApiError(response)
}

export async function listQaModels(signal?: AbortSignal): Promise<QaModel[]> {
  const response = await apiFetch(QA_MODELS_ROOT, { signal })
  const data: unknown = await readJson(response)
  if (!Array.isArray(data)) {
    throw new ProjectApiError(response.status, 'The server returned an unreadable model catalog.')
  }
  return data.flatMap((item) => {
    const record = asRecord(item)
    const reasoning = asRecord(record?.reasoning)
    if (
      record === null ||
      typeof record.id !== 'string' ||
      typeof record.label !== 'string' ||
      typeof record.provider !== 'string' ||
      typeof record.supportsVision !== 'boolean' ||
      typeof record.multimodal !== 'boolean' ||
      !Array.isArray(record.inputModalities) ||
      !record.inputModalities.every((value) => typeof value === 'string')
    ) {
      return []
    }

    let parsedReasoning: QaModel['reasoning'] = null
    if (
      reasoning?.kind === 'effort' &&
      Array.isArray(reasoning.efforts) &&
      reasoning.efforts.length > 0 &&
      reasoning.efforts.every((value) => typeof value === 'string')
    ) {
      parsedReasoning = {
        kind: 'effort',
        efforts: reasoning.efforts,
        minTokens: null,
        maxTokens: null,
        step: null,
      }
    } else if (
      reasoning?.kind === 'max_tokens' &&
      typeof reasoning.minTokens === 'number' &&
      typeof reasoning.maxTokens === 'number' &&
      typeof reasoning.step === 'number'
    ) {
      parsedReasoning = {
        kind: 'max_tokens',
        efforts: null,
        minTokens: reasoning.minTokens,
        maxTokens: reasoning.maxTokens,
        step: reasoning.step,
      }
    }

    return [{
      id: record.id,
      label: record.label,
      provider: record.provider,
      supportsVision: record.supportsVision,
      inputModalities: record.inputModalities,
      multimodal: record.multimodal,
      reasoning: parsedReasoning,
    }]
  })
}

export function isQaConflict(error: unknown): error is ProjectApiError {
  return error instanceof ProjectApiError && error.status === 409
}

/** One project's runs, newest first. Malformed rows are dropped, not fatal. */
export async function listQaTries(
  projectId: string,
  signal?: AbortSignal,
): Promise<QaTry[]> {
  const params = new URLSearchParams({ projectId, size: '20' })
  const response = await apiFetch(`${QA_ROOT}?${params}`, { signal })
  const data = await readJson(response)
  if (!Array.isArray(data)) {
    throw new ProjectApiError(response.status, 'The server returned an unreadable QA Try list.')
  }
  return data.flatMap((item) => {
    try {
      return [parseQaTry(item, response.status)]
    } catch {
      return []
    }
  })
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

/**
 * Sends one operator message to the running Agent.
 *
 * Accepted, not answered — the reply arrives on the log stream as a `CHAT` row,
 * so callers must not wait on this promise for one.
 */
export async function sendQaMessage(qaTryId: string, message: string): Promise<void> {
  const response = await apiFetch(qaPath(qaTryId, '/messages'), {
    method: 'POST',
    ...jsonRequest({ message }),
  })
  if (!response.ok) throw await toApiError(response)
}

/** Ends a running QA Try. A run that already ended answers 409. */
export async function cancelQaTry(qaTryId: string): Promise<void> {
  const response = await apiFetch(qaPath(qaTryId, '/cancel'), { method: 'POST' })
  if (!response.ok) throw await toApiError(response)
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
