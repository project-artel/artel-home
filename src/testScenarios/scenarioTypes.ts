/**
 * The TestScenario contract as the orchestration server defines it.
 *
 * `ScenarioDraft` is one shape used in three places — the stored `payload`, the
 * `scenario` on a stream result, and the `draft` sent back with a message — so
 * it is declared once and shared.
 */

export type ScenarioStep = {
  step: number
  title: string
  state: string
  action: string
  expected: string
}

export type ScenarioDraft = {
  title: string
  description: string
  steps: ScenarioStep[]
}

export const EMPTY_SCENARIO_DRAFT: ScenarioDraft = {
  title: '',
  description: '',
  steps: [],
}

export type ScenarioRole = 'USER' | 'ASSISTANT'

/**
 * One line of the chat thread.
 *
 * `id` is client-side only. The server does not return a message id, and a
 * pending message has no server identity yet, so React needs a key that exists
 * before the round trip completes.
 */
export type ChatMessage = {
  id: string
  role: ScenarioRole
  content: string
  createdAt: string | null
  /** A user message that has been sent but whose reply has not arrived yet. */
  pending: boolean
}

export type ScenarioResult = {
  type: 'result'
  message: string
  scenario: ScenarioDraft | null
}

export type ScenarioFailure = {
  type: 'error'
  code: string
  detail: string
}

export type ScenarioStreamEvent = ScenarioResult | ScenarioFailure

export type TestScenario = {
  testScenarioId: number
  projectId: number
  payload: ScenarioDraft
}

/**
 * One row of the project's scenario list — the summary the list endpoint
 * returns. Steps are not here; they come from the single read. Timestamps
 * degrade to empty strings, which `formatDate` renders as a placeholder.
 */
export type TestScenarioSummary = {
  testScenarioId: number
  title: string
  createdAt: string
  updatedAt: string
}

/** The server ignores `type` today; it is sent because the contract declares it. */
export const USER_MESSAGE_TYPE = 'USER_MESSAGE'

export function isScenarioDraftEqual(left: ScenarioDraft, right: ScenarioDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Renumbers `step` to match list order.
 *
 * `step` is the canvas's ordering key, so an inserted, removed, or moved step
 * would otherwise leave the server holding numbers that contradict the sequence
 * the user arranged.
 */
export function withSequentialSteps(steps: ScenarioStep[]): ScenarioStep[] {
  return steps.map((step, index) => ({ ...step, step: index + 1 }))
}

export function createEmptyStep(): ScenarioStep {
  return { step: 0, title: '', state: '', action: '', expected: '' }
}
