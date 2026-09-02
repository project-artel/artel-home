/**
 * The TestScenario contract as the orchestration server defines it.
 *
 * `ScenarioDraft` is one shape used in three places — the stored `payload`, the
 * `scenario` on a stream result, and the `draft` sent back with a message — so
 * it is declared once and shared.
 */

/**
 * One scenario step = one action (재설계 2026-08-08, ARTEL-285).
 *
 * Field names mirror the wire exactly (`draft` is sent to the server verbatim and
 * the stored `payload` is read back verbatim), so `case_id` stays snake_case.
 * A step carrying a `case_id` belongs to that TestCase's verification region — a
 * run of consecutive steps sharing one `case_id` is one TC, its last step the
 * check. A step with `case_id: null` is a plain action with no verdict.
 * `hint`/`input` are advisory notes for whoever runs it.
 */
export type ScenarioStep = {
  action: string
  case_id: number | null
  hint: string | null
  input: string | null
  /**
   * Whether this line is something to do, or a notice (ARTEL-468).
   *
   * `GAP` is not an action. It marks a place where the scene spec does not know the
   * route between two checks, so nothing was authored there — a run neither performs
   * nor judges it. Rendering it as a numbered step would be a lie twice over: whoever
   * runs it would try, and a thing nobody could do would be recorded as a failure.
   *
   * `null` means `ACTION` — every scenario authored before this field existed.
   */
  step_kind: 'ACTION' | 'GAP' | null
  /** What blocks the route, on a `GAP` — a scene pair or a variable name. */
  step_unknown_reason: string | null
  /**
   * Where the step came from. `HUMAN` is the one this screen writes: a step someone
   * typed into a gap. The server leaves those alone — it neither rewrites them from
   * the scene spec nor folds them into a notice, so an answer a person gave survives
   * the next authoring turn.
   */
  step_source: 'CASE' | 'CAPABILITY' | 'UNKNOWN' | 'HUMAN' | null
}

/** A notice block, not a step to run. */
export function isGapStep(step: ScenarioStep): boolean {
  return step.step_kind === 'GAP'
}

/**
 * An empty step for a person to fill in at a gap.
 *
 * Marked `HUMAN` so the server keeps it: an unmarked bridge in a gap the scene spec
 * cannot explain gets folded into the notice on the next save, which would throw away
 * the very answer this button exists to collect.
 */
export function createHumanStep(): ScenarioStep {
  return { ...createEmptyStep(), step_source: 'HUMAN', step_kind: 'ACTION' }
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
  /**
   * A question the server attached to this line (ARTEL-487). `null` on ordinary
   * messages. Carried on the message rather than kept beside the thread so that a
   * reload restores it in place — the question is that line, not something next to it.
   */
  question?: import('../testRuns/runChatApi').RunChatQuestion | null
  /**
   * Everything authoring could not settle that turn (ARTEL-630).
   *
   * One line carries them all. The server used to send one and stay silent about the
   * rest, so a run with five blocked spots asked about one and the user read the
   * scenarios as finished. Each is answered on its own; answering one leaves the others.
   */
  questions?: import('../testRuns/runChatApi').RunChatQuestion[]
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

export function createEmptyStep(): ScenarioStep {
  return {
    action: '', case_id: null, hint: null, input: null,
    step_kind: null, step_unknown_reason: null, step_source: null,
  }
}

/**
 * One TC verification region within a scenario: a run of consecutive steps that
 * share a `case_id`. Steps with no `case_id` are returned as their own single-step
 * groups with `caseId: null` (plain actions, no verdict). This is how the studio
 * renders steps grouped into TC boxes, and it is derived from step order alone.
 */
export type StepGroup = {
  caseId: number | null
  /** Indices into the scenario's `steps` array (0-based), in order. */
  indices: number[]
  steps: ScenarioStep[]
}

export function groupStepsByCase(steps: ScenarioStep[]): StepGroup[] {
  const groups: StepGroup[] = []
  steps.forEach((step, index) => {
    const last = groups[groups.length - 1]
    if (step.case_id !== null && last && last.caseId === step.case_id) {
      last.indices.push(index)
      last.steps.push(step)
    } else {
      groups.push({ caseId: step.case_id, indices: [index], steps: [step] })
    }
  })
  return groups
}
