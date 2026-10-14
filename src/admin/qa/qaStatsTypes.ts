/** 비교 축. `GET /api/qa-stats`의 셀이 이 넷으로 런을 분할한다. */
export const AXES = ['model', 'reasoningEffort', 'promptVersion', 'agentArch'] as const

export type Axis = (typeof AXES)[number]

/**
 * 축 조합 하나의 집계.
 *
 * 축 값이 null이면 "미상"이다 — ARTEL-239 이전에 끝난 런과, 세션 응답에 `run_config`를 싣지 않는
 * 구버전 Agent가 여기 들어온다. 화면에서 버리면 축별 합이 총계와 어긋난다.
 */
export interface QaStatsCell {
  model: string | null
  reasoningEffort: string | null
  promptVersion: string | null
  agentArch: string | null
  runs: number
  /** 끝까지 돈 런. QA 통과가 아니다 — `qa_try.status`는 런 생명주기다. */
  completed: number
  failed: number
  /** 운영자가 멈춘 런. 실패와 섞지 않는다. */
  cancelled: number
  /** 아직 도는 런. 완주율 분모에서 빠진다. */
  active: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  /** null은 "공짜"가 아니라 "단가 미상"이다. */
  costUsd: number | null
  llmCalls: number
  avgCompletedDurationMs: number | null

  /**
   * 자기채점 판정을 받은 런 수. 아래 네 합계의 분모다.
   *
   * `runs`와의 차이가 판정을 **모르는** 런이고, 그것은 0점인 런과 다르다 — 소켓 사망이나 취소로
   * 요약 없이 끝난 런이 여기 빠진다. 이 값을 보지 않고 합격률을 그리면 그 비율은 "깔끔하게 끝난
   * 런"에만 조건부이고, **잘 죽는 설정일수록 자기 최악 런이 빠져 편향 크기가 축마다 다르다.**
   */
  verdictKnown: number
  stepsTotal: number
  stepsPassed: number
  casesTotal: number
  casesPassed: number

  /**
   * 기대-라벨 채점(`grader='expected-steps'`)을 받은 런 수. 아래 다섯 합계의 분모다.
   *
   * `verdictKnown`과 **다른 수다**: 요약은 멀쩡히 받았지만 시나리오에 기대 라벨이 하나도 없어
   * 채점 대상이 아닌 런이 있다. 0이면 아래 다섯도 전부 0인데 그것은 "채점할 것이 없었다"이지
   * "0점"이 아니다.
   */
  scoredRuns: number
  /** 통과해야 했고 통과라 보고한 스텝 수. */
  correctPass: number
  /** 통과해야 했는데 실패라 보고한 스텝 수(오탐). */
  falseAlarm: number
  /**
   * 실패해야 했는데 통과라 보고한 스텝 수(미탐).
   *
   * `falseAlarm`과 한 숫자로 접지 않는다 — QA 에이전트에게 미탐이 훨씬 나쁘다(못 찾은 버그는
   * 출시된다). 스칼라 하나로 접으면 그 방향이 사라져 두 종류의 나쁜 모델이 같은 점수로 보인다.
   */
  miss: number
  /** 실패해야 했고 실패라 보고한 스텝 수. */
  correctFail: number
  /** 라벨은 있는데 그 스텝 판정이 오지 않은 수. 일치도 불일치도 아닌 세 번째 상태다. */
  unreported: number
}

/** 축이 없는 전체 합계. 자르기 전 전체에서 나오므로 셀의 합보다 클 수 있다. */
export type QaStatsTotals = Omit<
  QaStatsCell,
  'model' | 'reasoningEffort' | 'promptVersion' | 'agentArch'
>

export interface QaStats {
  /** 물어본 프로젝트. 전체 합산으로 부르면 null 이다. */
  projectId: string | null
  /**
   * 물어본 `label`. `testRunId`와 별개의 필터라 함께 실릴 수 있다 — 값을 안 실었으면 null이다.
   *
   * `qa_run`의 자유 문자열 컬럼이고, 여기 적히는 것은 실험 묶음 이름뿐이다. 그 실험의 arm이
   * 무엇인지는 `run_config`의 `content_map_mode` · `knowledge_mode`가 이미 말하므로 이름에 또
   * 적지 않는다 — 같은 사실이 두 군데 적히면 언젠가 어긋난다.
   */
  label: string | null
  from: string
  to: string
  total: QaStatsTotals
  cells: QaStatsCell[]
  /** 조합 수가 상한을 넘어 `cells`가 잘렸는지. 서면 표의 합이 총계보다 작다. */
  truncated: boolean
  cellLimit: number
}

export const QA_TRY_STATUSES = [
  'STARTING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

export type QaTryStatus = (typeof QA_TRY_STATUSES)[number]

/** 최근 런 한 줄. 축 값이 어디서 왔는지 되짚는 경로다. */
export interface QaTrySummary {
  id: string
  status: QaTryStatus
  startedAt: string
  completedAt: string | null
  model: string | null
  reasoningEffort: string | null
  promptVersion: string | null
  agentArch: string | null
  agentFingerprint: string | null
}
