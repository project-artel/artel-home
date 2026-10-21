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
import { functionOptionsRequestFields, type QaFunctionOptions } from './qaFunctionOptions'
import {
  QA_KEY_SOURCES,
  QA_LOG_DIRECTIONS,
  QA_LOG_TYPES,
  QA_TRY_STATUSES,
  type QaLog,
  type QaLogDirection,
  type QaLogPage,
  type QaLogType,
  type QaKeySource,
  type QaModel,
  type QaModelPricing,
  type QaReasoningSelection,
  type QaRun,
  type QaTry,
  type QaTryStatus,
} from './qaTypes'
import type { QaArchRequest } from './qaArch'

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
    qaRunId: optionalId(record.qaRunId),
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
  functionOptions?: QaFunctionOptions,
): Promise<QaTry> {
  const response = await apiFetch(QA_ROOT, {
    method: 'POST',
    ...jsonRequest({
      testScenarioId,
      gameInstanceId,
      model,
      reasoning,
      ...(functionOptions === undefined ? {} : functionOptionsRequestFields(functionOptions)),
    }),
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
    gameBuildId: optionalId(record.gameBuildId),
    status: parseStatus(record.status, status),
    startedAt: asNullableString(record.startedAt),
    completedAt: asNullableString(record.completedAt),
    tries,
    testRunGameBuildId: asNullableString(record.testRunGameBuildId),
  }
}

export type QaRunRequestBody = {
  testRunId: string
  gameInstanceId: string
  model: string
  keySource: QaKeySource
  reasoning: QaReasoningSelection | null
  force: boolean
  arch?: QaArchRequest
} & Partial<QaFunctionOptions>

/** `arch` 키는 구조를 바꾼 run 에만 실린다. 없으면 서버 기본 구조다. */
export function qaRunRequestBody(
  testRunId: string,
  gameInstanceId: string,
  model: string,
  keySource: QaKeySource,
  reasoning: QaReasoningSelection | null,
  force: boolean,
  arch: QaArchRequest | null,
  functionOptions?: QaFunctionOptions,
): QaRunRequestBody {
  const body: QaRunRequestBody = { testRunId, gameInstanceId, model, keySource, reasoning, force }
  if (arch !== null) body.arch = arch
  // 옵션을 안 보내면 서버 기본값(둘 다 켜고 catalog 전부)이 적용된다.
  if (functionOptions !== undefined) Object.assign(body, functionOptionsRequestFields(functionOptions))
  return body
}

/**
 * `POST /api/qa-runs` — start a TR-unit run (all its scenarios, in order).
 *
 * `force` ends whatever QA that game is still running and takes its place. It is
 * off by default and is meant to be a second call: send the plain request, and
 * if it comes back `qa_run_active`, ask the operator before sending it again
 * with `force`. Cancelling someone's run is not undoable, so nothing may infer
 * the intent from a first request that did not say it.
 */
export async function createQaRun(
  testRunId: string,
  gameInstanceId: string,
  model: string,
  keySource: QaKeySource,
  reasoning: QaReasoningSelection | null,
  force = false,
  arch: QaArchRequest | null = null,
  functionOptions?: QaFunctionOptions,
): Promise<QaRun> {
  const response = await apiFetch(QA_RUNS_ROOT, {
    method: 'POST',
    ...jsonRequest(qaRunRequestBody(testRunId, gameInstanceId, model, keySource, reasoning, force, arch, functionOptions)),
  })
  return parseQaRun(await readJson(response), response.status)
}

/** `GET /api/qa-runs/{id}` — the run overview: status + each scenario's try. */
export async function getQaRun(qaRunId: string, signal?: AbortSignal): Promise<QaRun> {
  const response = await apiFetch(`${QA_RUNS_ROOT}/${encodeURIComponent(qaRunId)}`, { signal })
  return parseQaRun(await readJson(response), response.status)
}

/**
 * `{ items: QaRunResponse[] }` 를 읽는다. 한 run 이라도 읽을 수 없으면 목록 전체가 실패한다 — `parseQaRun` 이
 * 상태를 모르면 던지는 것과 같은 규칙이다.
 */
export function parseQaRunList(data: unknown, status = 200): QaRun[] {
  const items = asRecord(data)?.items
  if (!Array.isArray(items)) {
    throw new ProjectApiError(status, 'The server returned an unreadable QA Run list.')
  }
  return items.map((item) => parseQaRun(item, status))
}

/**
 * `GET /api/projects/{projectId}/game-builds/{gameBuildId}/qa-runs`(ARTEL-1104, ARTEL-1155) — 이 빌드로 돈 run,
 * 새 run 이 앞에 온다. `size` 는 서버가 1 이상 100 이하만 받는다. 프로젝트 전체의 QA 실행 목록은
 * `qaLaunchApi.listProjectQaRuns` 다.
 */
export async function listGameBuildQaRuns(
  projectId: string,
  gameBuildId: string,
  options: { size?: number },
  signal?: AbortSignal,
): Promise<QaRun[]> {
  const query = options.size === undefined ? '' : `?${new URLSearchParams({ size: String(options.size) })}`
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/game-builds/${encodeURIComponent(gameBuildId)}/qa-runs${query}`,
    { signal },
  )
  return parseQaRunList(await readJson(response), response.status)
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
  return parseQaModels(await readJson(response), response.status)
}

/**
 * The model catalog. `keySource`, `keyProvider`, `keyRegistered`, `keyHint` and `pricing` are
 * optional: a server that does not send them yet offers every model on the
 * platform key, which is what it does today.
 */
export function parseQaModels(data: unknown, status: number): QaModel[] {
  if (!Array.isArray(data)) {
    throw new ProjectApiError(status, 'The server returned an unreadable model catalog.')
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

    const keySource: QaKeySource = isOneOf(record.keySource, QA_KEY_SOURCES)
      ? record.keySource
      : 'platform'

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
      keySource,
      keyProvider: keySource === 'user' && typeof record.keyProvider === 'string'
        ? record.keyProvider
        : null,
      // A user model is only callable once its provider has a key; a missing
      // flag must not turn into a run that fails on its first call.
      keyRegistered: keySource === 'platform' || record.keyRegistered === true,
      keyHint: typeof record.keyHint === 'string' ? record.keyHint : null,
      pricing: parsePricing(record.pricing),
    }]
  })
}

function parsePricing(value: unknown): QaModelPricing | null {
  const record = asRecord(value)
  return record !== null &&
    typeof record.inputPerMtok === 'number' &&
    typeof record.outputPerMtok === 'number'
    ? { inputPerMtok: record.inputPerMtok, outputPerMtok: record.outputPerMtok }
    : null
}

export function isQaConflict(error: unknown): error is ProjectApiError {
  return error instanceof ProjectApiError && error.status === 409
}

/**
 * Why the server refused to start a run, when it refused.
 *
 * The three reasons all answer `409` and are told apart by `code`, never by the
 * message: that message is prose we edit, and the previous match — a regex
 * looking for "sdk" in it — silently mapped "this test run has no scenarios" to
 * "that game is already running QA". `null` for anything that is not one of the
 * three, so callers fall through to their generic copy.
 */
export function qaStartConflict(
  error: unknown,
): 'sdk_disconnected' | 'qa_run_active' | 'test_run_empty' | null {
  if (!isQaConflict(error)) return null
  return error.code === 'sdk_disconnected' ||
    error.code === 'qa_run_active' ||
    error.code === 'test_run_empty'
    ? error.code
    : null
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
