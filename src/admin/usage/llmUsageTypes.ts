/**
 * LLM 지출 집계의 화면 쪽 모양(ARTEL-233 후속).
 *
 * 네 축은 같은 호출 집합을 다르게 접은 것이라 서로 겹친다 — `byService`, `byModel`, `byProject`,
 * `daily`의 합은 전부 `total`과 같다. QA 통계처럼 런을 4-튜플로 **분할**한 것이 아니므로, 두 축을
 * 겹쳐 매트릭스를 만들 수 없다. 이 파일이 축마다 별도 타입을 두는 이유다.
 */

/** 접힌 합계 한 벌. 축이 무엇이든 실리는 숫자는 같다. */
export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  /** null은 "단가 미상"이다. **0(공짜)과 다르다** — 같은 글자로 그리면 비용 비교가 조용히 틀린다. */
  costUsd: number | null
  calls: number
  /** `costUsd`가 몇 건 위에 얹힌 값인지. `calls`보다 작으면 그 금액은 실제 지출의 하한이다. */
  pricedCalls: number
}

export interface ServiceCell {
  service: string
  totals: UsageTotals
}

export interface ModelCell {
  provider: string
  model: string
  totals: UsageTotals
}

export interface ProjectCell {
  projectId: string
  projectName: string
  totals: UsageTotals
}

/** 호출이 없던 날은 줄 자체가 없다. 서버가 0인 날을 채우지 않는다. */
export interface DailyCell {
  /** `YYYY-MM-DD`. `zone` 기준으로 잘린 날짜라 `Date`로 되돌리지 않는다. */
  date: string
  totals: UsageTotals
}

export interface LlmUsageStats {
  projectId: string | null
  from: string
  to: string
  /** `daily`의 하루 경계를 자른 시간대. 이 값이 없으면 월말 하루가 어느 쪽인지 알 수 없다. */
  zone: string
  total: UsageTotals
  byService: ServiceCell[]
  byModel: ModelCell[]
  byProject: ProjectCell[]
  daily: DailyCell[]
  /**
   * 프로젝트를 못 푼 호출 수. **위 어느 합계에도 안 들어간다.**
   *
   * 0이 아니면 `total`은 배포 전체 지출의 부분합이다. 서버가 건수만 주는 이유는 그 호출들을
   * 멤버십으로 거를 수 없어서다(관리자 role이 없다).
   */
  unattributedCalls: number
}

export const QA_RUN_STATUSES = [
  'STARTING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

export type QaRunStatus = (typeof QA_RUN_STATUSES)[number]

/** QA 런 한 건의 지출. "QA 실행마다 몇 토큰"에 답하는 줄이다. */
export interface QaRunUsage {
  qaTryId: string
  projectId: string
  status: QaRunStatus
  startedAt: string
  completedAt: string | null
  model: string | null
  reasoningEffort: string | null
  promptVersion: string | null
  agentArch: string | null
  totals: UsageTotals
}

