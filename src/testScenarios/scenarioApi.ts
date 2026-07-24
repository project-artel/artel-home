import { apiFetch, orchestrationUrlFor } from '../auth/authApi'
import {
  asRecord,
  asString,
  jsonRequest,
  ProjectApiError,
  readJson,
  toApiError,
} from '../projects/projectApi'
import {
  EMPTY_SCENARIO_DRAFT,
  USER_MESSAGE_TYPE,
  type ChatMessage,
  type ScenarioDraft,
  type ScenarioRole,
  type ScenarioStep,
  type ScenarioStreamEvent,
  type TestScenario,
} from './scenarioTypes'

/*
 * Every call goes through `apiFetch`, so 401 stays owned by one place, and
 * `ProjectApiError` is reused rather than re-declared — these endpoints return
 * the same error body, and a second error class would make every component test
 * for two.
 *
 * The stream is the exception: `EventSource` is not `fetch`, so it carries the
 * session cookie through `withCredentials` and reports failures on its own.
 */

const SCENARIO_ROOT = '/api/test-scenario'

function scenarioPath(testScenarioId: number, suffix = ''): string {
  return `${SCENARIO_ROOT}/${encodeURIComponent(testScenarioId)}${suffix}`
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asRole(value: unknown): ScenarioRole {
  return value === 'ASSISTANT' ? 'ASSISTANT' : 'USER'
}

function parseStep(data: unknown, index: number): ScenarioStep | null {
  const record = asRecord(data)
  if (record === null) return null

  // `step` degrades to list position: it is only an ordering key, and dropping
  // a step because the server omitted its number would silently shorten the
  // scenario the user is reviewing.
  return {
    step: asNumber(record.step, index + 1),
    title: asString(record.title),
    state: asString(record.state),
    action: asString(record.action),
    expected: asString(record.expected),
  }
}

/**
 * A missing or unreadable payload degrades to the empty draft rather than
 * failing the screen. The server initialises `payload` to an empty
 * `ScenarioDraft` at creation, so "nothing here yet" is a normal state, not an
 * error — it is what every scenario looks like before the first agent reply.
 */
export function parseScenarioDraft(data: unknown): ScenarioDraft {
  const record = asRecord(data)
  if (record === null) return EMPTY_SCENARIO_DRAFT

  const steps = Array.isArray(record.steps) ? record.steps : []

  return {
    title: asString(record.title),
    description: asString(record.description),
    steps: steps
      .map(parseStep)
      .filter((step): step is ScenarioStep => step !== null),
  }
}

function parseScenario(data: unknown, status: number): TestScenario {
  const record = asRecord(data)
  const testScenarioId = record === null ? null : record.testScenarioId

  if (typeof testScenarioId !== 'number') {
    throw new ProjectApiError(status, 'The server described the scenario oddly.')
  }

  return {
    testScenarioId,
    projectId: asNumber(record?.projectId),
    payload: parseScenarioDraft(record?.payload),
  }
}

/**
 * The server returns no message id, so one is derived from position. The list
 * is replaced wholesale on every read, so the index is stable for as long as
 * the key is used.
 */
function parseMessage(data: unknown, index: number): ChatMessage | null {
  const record = asRecord(data)
  if (record === null) return null

  const content = asString(record.content)
  if (content.length === 0) return null

  return {
    id: `stored-${index}`,
    role: asRole(record.role),
    content,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
    pending: false,
  }
}

/** Accepts a bare array or an `{ items: [...] }` envelope, as the project lists do. */
function toItemArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data

  const items = asRecord(data)?.items
  return Array.isArray(items) ? items : []
}

export async function createTestScenario(projectId: number): Promise<number> {
  const response = await apiFetch(SCENARIO_ROOT, {
    method: 'POST',
    ...jsonRequest({ projectId }),
  })
  const record = asRecord(await readJson(response))
  const testScenarioId = record === null ? null : record.testScenarioId

  if (typeof testScenarioId !== 'number') {
    throw new ProjectApiError(response.status, 'The server did not return a scenario id.')
  }

  return testScenarioId
}

export async function getTestScenario(
  testScenarioId: number,
  signal?: AbortSignal,
): Promise<TestScenario> {
  const response = await apiFetch(scenarioPath(testScenarioId), { signal })
  return parseScenario(await readJson(response), response.status)
}

export async function listScenarioMessages(
  testScenarioId: number,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const response = await apiFetch(scenarioPath(testScenarioId, '/messages'), { signal })
  return toItemArray(await readJson(response))
    .map(parseMessage)
    .filter((message): message is ChatMessage => message !== null)
}

/**
 * Relays one user message to the agent.
 *
 * A `200` means the orchestration server accepted the relay, not that the agent
 * answered: the reply arrives on the stream. The response body is a plain
 * string, so there is nothing to parse and nothing to apply to the screen.
 *
 * `draft` carries the canvas. The caller sends it on every message, so the
 * agent always rebases on the scenario the user is looking at. It is accepted
 * as `null` for the one case that cannot use it: the first message of a
 * scenario opens the agent session, and the session contract has no slot for a
 * draft, so a scenario reopened after its session ended starts the agent from
 * nothing. Carrying it into the session hand-off needs a server change.
 */
export async function sendScenarioMessage(
  testScenarioId: number,
  message: string,
  draft: ScenarioDraft | null,
): Promise<void> {
  const response = await apiFetch(scenarioPath(testScenarioId, '/message'), {
    method: 'POST',
    ...jsonRequest({
      type: USER_MESSAGE_TYPE,
      testScenarioMessage: message,
      ...(draft === null ? {} : { draft }),
    }),
  })

  if (!response.ok) {
    throw await toApiError(response)
  }
}

/**
 * Approves the scenario: the server finalizes the current draft as the stored
 * `payload`, clears the chat thread it was authored in, and closes the agent
 * session (which ends the stream with a `closed` event). The draft travels with
 * the call so the finalized scenario is exactly what the user is looking at,
 * unsent canvas edits included.
 *
 * A `404` means the scenario is gone or not this user's to approve; the caller
 * treats it as already-removed rather than a fault.
 */
export async function approveTestScenario(
  testScenarioId: number,
  draft: ScenarioDraft,
): Promise<void> {
  const response = await apiFetch(scenarioPath(testScenarioId, '/approve'), {
    method: 'POST',
    ...jsonRequest({ draft }),
  })

  if (!response.ok) {
    throw await toApiError(response)
  }
}

/**
 * Deletes the scenario and its conversation outright (Decline). The server also
 * closes the agent session. There is no restore path, so the caller confirms
 * first and leaves the screen once it resolves.
 */
export async function deleteTestScenario(testScenarioId: number): Promise<void> {
  const response = await apiFetch(scenarioPath(testScenarioId), { method: 'DELETE' })

  if (!response.ok) {
    throw await toApiError(response)
  }
}

/**
 * Persists canvas edits the user made without the agent — reordering steps or
 * editing fields. Unlike `sendScenarioMessage`, this does not touch the agent;
 * it writes the current draft straight to the scenario's `payload` (last write
 * wins). The server returns the stored scenario so the caller can rebaseline
 * `saved` to exactly what was persisted.
 *
 * A `404` means the scenario is gone or not this user's to edit.
 */
export async function updateScenario(
  testScenarioId: number,
  draft: ScenarioDraft,
): Promise<TestScenario> {
  const response = await apiFetch(scenarioPath(testScenarioId), {
    method: 'PUT',
    ...jsonRequest({ draft }),
  })
  return parseScenario(await readJson(response), response.status)
}

export function scenarioStreamUrl(testScenarioId: number): string {
  return orchestrationUrlFor(scenarioPath(testScenarioId, '/stream'))
}

/**
 * Reads one SSE payload. Anything that is not a recognised event is dropped:
 * the stream is a relay for an agent whose vocabulary may grow, and an
 * unfamiliar event is not a reason to tear down a working session.
 */
export function parseStreamEvent(data: string): ScenarioStreamEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }

  const record = asRecord(parsed)
  if (record === null) return null

  if (record.type === 'result') {
    return {
      type: 'result',
      message: asString(record.message),
      // A result without a scenario leaves the canvas as it was rather than
      // blanking it — the agent answered, it just did not revise the steps.
      scenario: record.scenario === undefined || record.scenario === null
        ? null
        : parseScenarioDraft(record.scenario),
    }
  }

  if (record.type === 'error') {
    return { type: 'error', code: asString(record.code), detail: asString(record.detail) }
  }

  return null
}
