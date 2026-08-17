import { apiFetch, orchestrationUrlFor } from '../auth/authApi'
import {
  asRecord,
  asString,
  jsonRequest,
  readJson,
  toApiError,
} from '../projects/projectApi'
import { parseSteps } from '../testScenarios/scenarioApi'
import type { ChatMessage, ScenarioRole, ScenarioStep } from '../testScenarios/scenarioTypes'

/*
 * Run-scoped authoring chat (ARTEL-206 Step 6). The conversation belongs to a
 * TestRun, not a single scenario: one chat can add and edit several scenarios in
 * the run, and it stays continuous as the user moves between the run's scenarios.
 *
 * Mirrors `scenarioApi.ts`: every call goes through `apiFetch` (cookie auth, 401
 * owned in one place); the SSE stream is the exception and carries the cookie via
 * `EventSource`'s `withCredentials`.
 */

function chatPath(projectId: string, runId: string, suffix: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/chat${suffix}`
}

/**
 * One scenario the agent proposes for the run (재설계 2026-08-08). `scenarioId`
 * null = a brand-new scenario to add; a number = an edit of that existing
 * scenario. `steps` is the scenario body — ordered actions, each with an optional
 * `case_id` mapping it to the TestCase it verifies. Sent back unchanged on commit.
 */
export type ScenarioProposal = {
  scenarioId: number | null
  title: string
  description: string
  steps: ScenarioStep[]
}

export type RunChatResult = {
  type: 'result'
  message: string
  scenarios: ScenarioProposal[]
}

export type RunChatFailure = {
  type: 'error'
  code: string
  detail: string
}

/**
 * Where the current authoring turn is (ARTEL-419). Only stages the server
 * actually observed are sent, so the middle two can be absent — a turn that
 * calls no tool is normal. `repairing` is not an ending: another result follows.
 */
export const AUTHORING_STAGES = [
  'sent',
  'looking_up_cases',
  'writing',
  'checking',
  'saved',
  'repairing',
  'blocked',
] as const

export type AuthoringStage = (typeof AUTHORING_STAGES)[number]

/** Stages after which nothing more arrives for this turn. */
export const TERMINAL_STAGES: readonly AuthoringStage[] = ['saved', 'blocked']

export type RunChatProgress = {
  type: 'progress'
  stage: AuthoringStage
}

/** An ASSISTANT line the *server* wrote (repair notice, audit refusal, remaining count). */
export type RunChatNotice = {
  type: 'notice'
  message: string
}

export type RunChatStreamEvent =
  | RunChatResult
  | RunChatFailure
  | RunChatProgress
  | RunChatNotice

/** Absolute URL for the SSE stream (EventSource can't go through `apiFetch`). */
export function runChatStreamUrl(projectId: string, runId: string): string {
  return orchestrationUrlFor(chatPath(projectId, runId, '/stream'))
}

/** Sends a user message; the agent's result arrives on the SSE stream. */
export async function sendRunChatMessage(
  projectId: string,
  runId: string,
  message: string,
  autoApply: boolean,
): Promise<void> {
  const response = await apiFetch(chatPath(projectId, runId, '/message'), {
    method: 'POST',
    ...jsonRequest({ message, autoApply }),
  })
  if (!response.ok) {
    throw await toApiError(response)
  }
}

/** The run's private chat thread (revisit restore). */
export async function listRunChatMessages(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const response = await apiFetch(chatPath(projectId, runId, '/messages'), { signal })
  const raw = await readJson(response)
  if (!Array.isArray(raw)) return []
  return raw.map((entry, index) => {
    const record = asRecord(entry) ?? {}
    const role = asString(record.role) === 'USER' ? 'USER' : 'ASSISTANT'
    return {
      id: `msg-${index}`,
      role: role as ScenarioRole,
      content: asString(record.content),
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
      pending: false,
    }
  })
}

/** Ends the authoring session (Agent WS + SSE). Chat and scenarios are kept. */
export async function closeRunChat(projectId: string, runId: string): Promise<void> {
  const response = await apiFetch(chatPath(projectId, runId, '/close'), { method: 'POST' })
  if (!response.ok) {
    throw await toApiError(response)
  }
}

/**
 * Applies user-approved proposals to the run (card-commit mode). Uses the same
 * reconcile engine as server auto-apply: `scenarioId` null inserts, a number
 * edits. Sent with snake_case keys to match the orchestration contract.
 */
export async function commitRunScenarios(
  projectId: string,
  runId: string,
  scenarios: ScenarioProposal[],
): Promise<void> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/scenarios/commit`
  const response = await apiFetch(path, {
    method: 'POST',
    ...jsonRequest({
      scenarios: scenarios.map((s) => ({
        scenario_id: s.scenarioId,
        title: s.title,
        description: s.description,
        steps: s.steps,
      })),
    }),
  })
  if (!response.ok) {
    throw await toApiError(response)
  }
}

function parseProposal(value: unknown): ScenarioProposal {
  const record = asRecord(value) ?? {}
  const rawId = record.scenario_id
  const scenarioId =
    typeof rawId === 'number' ? rawId : typeof rawId === 'string' ? Number(rawId) : null
  return {
    scenarioId: scenarioId !== null && Number.isFinite(scenarioId) ? scenarioId : null,
    title: asString(record.title),
    description: asString(record.description),
    steps: parseSteps(record.steps),
  }
}

function isAuthoringStage(value: unknown): value is AuthoringStage {
  return AUTHORING_STAGES.includes(value as AuthoringStage)
}

/**
 * Parses one SSE frame. `result` carries the message + a scenarios[] proposal
 * array; `error` carries code/detail; `progress` a stage; `notice` a
 * server-written assistant line. Unknown frames (e.g. an internal
 * `test_case_search` that leaked) degrade to null and are dropped, never thrown.
 *
 * An unrecognised stage degrades to null too. A server that learns a new stage
 * should not make this client render an empty step — silence is the honest
 * fallback, and the terminal stages it does know still close the indicator.
 */
export function parseRunStreamEvent(data: string): RunChatStreamEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  const record = asRecord(parsed)
  if (record === null) return null

  if (record.type === 'result') {
    const scenarios = Array.isArray(record.scenarios)
      ? record.scenarios.map(parseProposal)
      : []
    return { type: 'result', message: asString(record.message), scenarios }
  }
  if (record.type === 'error') {
    return { type: 'error', code: asString(record.code), detail: asString(record.detail) }
  }
  if (record.type === 'progress') {
    return isAuthoringStage(record.stage) ? { type: 'progress', stage: record.stage } : null
  }
  if (record.type === 'notice') {
    return { type: 'notice', message: asString(record.message) }
  }
  return null
}
