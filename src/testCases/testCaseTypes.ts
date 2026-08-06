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
  category: string
  title: string
  precondition: string | null
  expected: string
  verificationStatus: VerificationStatus
  /** The last game build a run verified this case against, or `null` if never. */
  lastVerifiedBuildId: string | null
  createdAt: string
}

/**
 * The mutable fields of a case. Every field is optional so a partial edit — a
 * status flip, a renamed title — sends only what changed, matching the server's
 * "apply the fields you were given" update.
 */
export type TestCaseInput = {
  category?: string
  title?: string
  precondition?: string | null
  expected?: string
  verificationStatus?: VerificationStatus
}

/**
 * 저작 Step의 종류(ARTEL-254/269). `setup`은 사전조건 도달(판정 없이 fast-forward),
 * `guide`는 실행, `verify`는 검증. 서버가 새 종류를 보내면 파싱 단계에서 `guide`로 접는다.
 */
export const CASE_STEP_KINDS = ['setup', 'guide', 'verify'] as const
export type CaseStepKind = (typeof CASE_STEP_KINDS)[number]

/**
 * 한 자리(position)에 붙는 저작 Step 하나. 케이스가 아니라 **그 자리** 전용이라, 같은 케이스가
 * 여러 자리에 와도 Step은 자리마다 다르다. Agent가 시나리오를 만들 때 생성해 오고, 사용자가
 * 확인·수정한다. 실행 시 Agent에겐 advisory(씬과 다르면 무시).
 */
export type CaseStep = {
  /** 클라이언트 자리 핸들. 서버 저장 시 유지되며, 신규 행은 빈 문자열로 보내도 된다. */
  id: string
  kind: CaseStepKind
  /** 판정 여부. setup은 false(판정 안 함). */
  assert: boolean
  intent: string
  hint: string | null
  /** `keyboard` | `click` (interactable 유무로 추론), 없으면 null. */
  input: string | null
  /** verify가 볼 대상. */
  observe: string | null
}

/** One position in a scenario's ordered case composition (`/cases`), with its authored Steps. */
export type ScenarioCaseItem = {
  position: number
  case: TestCase
  steps: CaseStep[]
}
