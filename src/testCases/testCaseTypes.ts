/**
 * The TestCase contract as the orchestration server defines it
 * (`/api/projects/{projectId}/test-cases`).
 *
 * A TestCase is a reusable, feature-level verification. Scenarios reference it
 * by id through the composition endpoint; it is not owned by any one scenario,
 * so its fields live here rather than inside a scenario's payload.
 *
 * Id-bearing fields are strings: the server returns 64-bit ids as strings to
 * avoid the precision loss JavaScript numbers would introduce.
 */

export type VerificationStatus = 'DRAFT' | 'VERIFIED' | 'BROKEN'

/** Display order for status pickers and filters (verified-first, matching the studio). */
export const VERIFICATION_STATUSES: VerificationStatus[] = ['VERIFIED', 'DRAFT', 'BROKEN']

/** The server's default for a freshly created case, before any run verifies it. */
export const DEFAULT_VERIFICATION_STATUS: VerificationStatus = 'DRAFT'

export function asVerificationStatus(value: unknown): VerificationStatus {
  return value === 'VERIFIED' || value === 'BROKEN' ? value : 'DRAFT'
}

export type TestCase = {
  id: string
  projectId: string
  /** The screen this case verifies, as the spec named it. */
  scene: string
  /** What the tester does — the spec's test step. */
  step: string
  precondition: string | null
  expectedValue: string
  /**
   * The status the spec's author set ("ready" and so on), or `null` for a case
   * that predates the field or was written by hand here.
   *
   * Deliberately separate from `verificationStatus`: that one is what OUR QA run
   * concluded, this one is what the spec side declared. Folding them into one
   * field would lose the difference between "the spec is ready" and "we have
   * verified it", which is exactly the pair a reviewer needs to see.
   */
  status: string | null
  verificationStatus: VerificationStatus
  /** The last game build a run verified this case against, or `null` if never. */
  lastVerifiedBuildId: string | null
  createdAt: string
  /**
   * Why the spec side graded this case the way it did — reason codes from
   * `metadata.source.evidence_gaps`, empty when there is nothing to say.
   *
   * Only the single-case endpoint sends these; a list response omits the field
   * entirely and it parses to `[]`. That is deliberate on the server side: a
   * project can hold a thousand cases, and a reason a reviewer reads one at a
   * time does not belong on every row of every list.
   */
  evidenceGaps: string[]
}

/**
 * How loudly to draw a spec grade. The grade is the spec author's own judgement
 * of its wording, so `ready` should read as "nothing to see" and everything
 * below it should catch the eye — the point of showing the grade at all is the
 * cases that are NOT settled.
 */
export type SpecGradeTone = 'settled' | 'provisional' | 'blocked'

/**
 * The grades the spec side defines (agent-server ARTEL-327):
 * `ready` wording is settled · `candidate` not settled yet · `review` waiting on
 * a person · `unsupported` could not be grounded in the build, so it cannot run.
 *
 * A table rather than a chain of comparisons, because we do NOT own this
 * vocabulary. Today the spec side plans to send only `ready` and `candidate`,
 * but that is undecided, and a value we have not seen must render as an ordinary
 * chip instead of breaking the card. Adding a grade later is one line here.
 */
const SPEC_GRADE_TONES: Record<string, SpecGradeTone> = {
  ready: 'settled',
  candidate: 'provisional',
  review: 'provisional',
  unsupported: 'blocked',
}

/** The tone for a grade, or `null` for one we do not know — draw those neutrally. */
export function specGradeTone(status: string): SpecGradeTone | null {
  return SPEC_GRADE_TONES[status.toLowerCase()] ?? null
}

/**
 * The mutable fields of a case. Every field is optional so a partial edit — a
 * status flip, a reworded step — sends only what changed, matching the server's
 * "apply the fields you were given" update.
 */
export type TestCaseInput = {
  scene?: string
  step?: string
  precondition?: string | null
  expectedValue?: string
  verificationStatus?: VerificationStatus
}

/** One position in a scenario's ordered case composition (`/cases`). */
export type ScenarioCaseItem = {
  position: number
  case: TestCase
}


/**
 * How much of a project's cases the scenarios actually reach
 * (`GET /api/projects/{projectId}/test-cases/coverage`).
 *
 * Two axes, deliberately not merged. `authored` counts cases some scenario
 * references; `verified`/`draft`/`broken` is what OUR QA runs concluded. A case
 * that is authored but never run and one that ran and broke need different work
 * from the person reading, and one combined number hides which is which.
 *
 * `unauthored` is `total - authored`, and the server sends it anyway so this
 * side never does the subtraction — a number computed in two places eventually
 * disagrees with itself, and then neither can be trusted.
 */
export type TestCaseCoverage = {
  total: number
  authored: number
  unauthored: number
  verified: number
  draft: number
  broken: number
  /** Scenes with cases nothing has reached yet, largest first. */
  uncoveredScenes: UncoveredScene[]
}

/** One scene and how many of its cases no scenario has reached. */
export type UncoveredScene = {
  scene: string
  count: number
}
