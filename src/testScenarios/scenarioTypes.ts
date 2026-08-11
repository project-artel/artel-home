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
   * Whether this step is expected to pass or to fail (ARTEL-302).
   *
   * The QA agent grades its own steps, so a lenient model scores well and
   * answering "everything passed" scores full marks. Labelling steps by hand
   * ends that game: with an expected failure in the scenario, that strategy
   * becomes the worst score rather than the best.
   *
   * `null` means "not graded" — it is NOT "expected to pass". Defaulting to
   * `true` would count every unlabelled step as a pass the agent got right, and
   * that error is silent: the number just looks better. Scenarios written before
   * this field are all `null` and are never backfilled — an answer key a machine
   * guessed at is worse than none.
   *
   * The label never reaches the agent. The server strips it from both the
   * execution contract and the chat context.
   */
  expected_passed: boolean | null
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

export function createEmptyStep(): ScenarioStep {
  // `expected_passed: null` is the default on purpose — see the field's own note.
  // A new step is unlabelled until a human decides, not "expected to pass".
  return { action: '', case_id: null, hint: null, input: null, expected_passed: null }
}

/**
 * How many steps this scenario expects to FAIL.
 *
 * Surfaced to the author because a scenario with zero of them cannot catch a
 * lenient model: every label agrees with "everything passed", so the scenario
 * scores a generous model and a careful one identically. Labelling costs the
 * author time, and this count is how they see whether that time bought anything.
 */
export function countExpectedFailures(steps: ScenarioStep[]): number {
  return steps.filter((step) => step.expected_passed === false).length
}

/**
 * Index of the first step expected to fail, or `-1`.
 *
 * A step that is supposed to fail may well stop the run there, which leaves
 * every later step unreachable — reported by nobody and graded as unreported.
 * That is not a bug, but an author who does not know it will read the resulting
 * coverage as the model's fault rather than the scenario's shape.
 */
export function firstExpectedFailureIndex(steps: ScenarioStep[]): number {
  return steps.findIndex((step) => step.expected_passed === false)
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
