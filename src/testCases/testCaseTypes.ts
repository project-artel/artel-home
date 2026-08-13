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
