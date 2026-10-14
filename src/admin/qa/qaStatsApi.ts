import {
  apiFetch,
  asNullableNumber,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  readJson,
} from '../shared/adminApi'
import {
  QA_TRY_STATUSES,
  type QaStats,
  type QaStatsCell,
  type QaStatsTotals,
  type QaTryStatus,
  type QaTrySummary,
} from './qaStatsTypes'

export interface QaStatsQuery {
  /** null이면 볼 수 있는 전 프로젝트를 합산한다(ARTEL-750). */
  projectId: string | null
  from: Date
  to: Date
  /**
   * null이면 모든 `test run`의 `qa run`을 합산한다.
   *
   * `qa_try.qa_run_id`가 nullable이라 어느 `test run`에도 속하지 않는 단독 실행 `qa run`이
   * 있다 — `testRunId`를 실으면 그 런들이 이 집계에서 빠진다. 그래서 이 필드의 기본값은
   * 반드시 null(전체)이어야 한다.
   */
  testRunId: string | null
  /**
   * null이면 모든 `label`의 `qa run`을 합산한다. `testRunId`와 독립이라 함께 실을 수 있다 —
   * "1차 실험의 9013 런"처럼 둘 다 좁히는 질문이 실제로 나온다.
   *
   * `label`도 `qa_run` 컬럼이라 단독 실행 `qa run`에는 없다. `testRunId`와 같은 이유로 기본값은
   * 반드시 null(전체)이어야 한다.
   */
  label: string | null
}

/**
 * 4축 조합 셀과 전체 합계를 한 번에 받는다.
 *
 * 축을 서버에 되묻지 않는 이유는 런이 4-튜플로 분할되기 때문이다 — 단일 축 분해도 두 축
 * 매트릭스도 이 셀의 부분합이라, 사용자가 축을 바꿔도 왕복이 생기지 않는다.
 */
export async function fetchQaStats(
  { projectId, from, to, testRunId, label }: QaStatsQuery,
  signal?: AbortSignal,
): Promise<QaStats> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  // 생략하면 서버가 볼 수 있는 전 프로젝트를 합산한다(ARTEL-750). 빈 문자열을 실으면 그것이
  // 프로젝트 id 로 읽혀 400 이 된다.
  if (projectId !== null) params.set('projectId', projectId)
  // 생략하면 모든 test run을 합산한다. 빈 문자열을 실으면 그것이 testRunId로 읽혀 400이
  // 된다 — projectId와 같은 규칙이다.
  if (testRunId !== null) params.set('testRunId', testRunId)
  // testRunId와 독립인 필터라 따로 싣는다. 빈 문자열을 실으면 그것이 label로 읽혀 400이
  // 된다 — projectId·testRunId와 같은 규칙이다.
  if (label !== null) params.set('label', label)
  const response = await apiFetch(`/api/qa-stats?${params}`, { signal })
  const body = asRecord(await readJson(response))

  return {
    projectId: typeof body.projectId === 'string' ? body.projectId : null,
    label: asNullableString(body.label),
    from: asString(body.from, 'from'),
    to: asString(body.to, 'to'),
    total: parseTotals(asRecord(body.total)),
    cells: (Array.isArray(body.cells) ? body.cells : []).map((cell) =>
      parseCell(asRecord(cell)),
    ),
    truncated: body.truncated === true,
    cellLimit: asNumber(body.cellLimit, 0),
  }
}

function parseTotals(raw: Record<string, unknown>): QaStatsTotals {
  return {
    runs: asNumber(raw.runs, 0),
    completed: asNumber(raw.completed, 0),
    failed: asNumber(raw.failed, 0),
    cancelled: asNumber(raw.cancelled, 0),
    active: asNumber(raw.active, 0),
    inputTokens: asNumber(raw.inputTokens, 0),
    outputTokens: asNumber(raw.outputTokens, 0),
    cachedInputTokens: asNumber(raw.cachedInputTokens, 0),
    reasoningTokens: asNumber(raw.reasoningTokens, 0),
    // 0으로 떨어뜨리지 않는다. "단가 미상"이 "공짜"로 읽히면 비용 비교가 조용히 틀린다.
    costUsd: asNullableNumber(raw.costUsd),
    llmCalls: asNumber(raw.llmCalls, 0),
    avgCompletedDurationMs: asNullableNumber(raw.avgCompletedDurationMs),
    // 판정과 채점은 서버가 이미 합계로 준다(평균이 아니다). 여기서 비율로 접지 않는 이유도 같다 —
    // 비율만 들고 있으면 그것이 몇 개의 런 위에 얹힌 값인지가 파싱 시점에 사라진다.
    //
    // 기본값 0은 "서버가 이 필드를 아직 안 준다"까지 덮는다. 그래도 안전한 것은 커버리지
    // (verdictKnown / scoredRuns)도 함께 0이 되어 화면이 비율을 그리지 않고 "판정 없음"으로
    // 떨어지기 때문이다. 합계만 0으로 떨어뜨리고 분모를 살려 두면 그때가 "점수 0"이 된다.
    verdictKnown: asNumber(raw.verdictKnown, 0),
    stepsTotal: asNumber(raw.stepsTotal, 0),
    stepsPassed: asNumber(raw.stepsPassed, 0),
    casesTotal: asNumber(raw.casesTotal, 0),
    casesPassed: asNumber(raw.casesPassed, 0),
    scoredRuns: asNumber(raw.scoredRuns, 0),
    correctPass: asNumber(raw.correctPass, 0),
    falseAlarm: asNumber(raw.falseAlarm, 0),
    miss: asNumber(raw.miss, 0),
    correctFail: asNumber(raw.correctFail, 0),
    unreported: asNumber(raw.unreported, 0),
  }
}

function parseCell(raw: Record<string, unknown>): QaStatsCell {
  return {
    model: asNullableString(raw.model),
    reasoningEffort: asNullableString(raw.reasoningEffort),
    promptVersion: asNullableString(raw.promptVersion),
    agentArch: asNullableString(raw.agentArch),
    ...parseTotals(raw),
  }
}

/**
 * 이미 쓰인 `label` 목록. 최근에 쓰인 것부터, 최대 200개.
 *
 * 자유 입력을 막고 이 목록에서 고르게 하려고 부른다 — `content map 1차`와
 * `content map 1차 실험`이 자유 문자열로는 두 칸으로 갈리는데, 목록에서 고르게 하면
 * tag 체계를 새로 만들지 않고도 그것이 막힌다. 새 이름을 짓는 자리는 여기가 아니라 런을
 * 걸 때다.
 *
 * `projectId`가 null이면 볼 수 있는 전 프로젝트의 `label`을 합쳐 준다. 날짜 창(`from`/`to`)은
 * 받지 않는다 — 창을 좁혔다고 고르려던 `label`이 목록에서 사라지면 안 되기 때문이다. 그래서
 * 목록에 있는 `label`을 골라도 현재 창에서 0건일 수 있다.
 */
export async function fetchQaLabels(
  projectId: string | null,
  signal?: AbortSignal,
): Promise<string[]> {
  const params = new URLSearchParams()
  if (projectId !== null) params.set('projectId', projectId)
  const response = await apiFetch(`/api/qa-stats/labels?${params}`, { signal })
  const body = asRecord(await readJson(response))

  return (Array.isArray(body.labels) ? body.labels : []).filter(
    (label): label is string => typeof label === 'string',
  )
}

/**
 * 최근 런. 집계가 아니라 개별 런으로 돌아가는 길이다.
 *
 * `reasoningEffort`는 `QaTryResponse`에 없어 `runConfig` 스냅샷에서 읽는다. 승격 컬럼이지만
 * 응답 필드로는 노출되지 않았다.
 */
export async function fetchRecentQaTries(
  projectId: string,
  size: number,
  signal?: AbortSignal,
): Promise<QaTrySummary[]> {
  const params = new URLSearchParams({ projectId, size: String(size) })
  const response = await apiFetch(`/api/qa-tries?${params}`, { signal })
  const body = await readJson(response)
  const items = Array.isArray(body) ? body : []

  return items.map((item) => {
    const run = asRecord(item)
    const runConfig =
      typeof run.runConfig === 'object' && run.runConfig !== null
        ? (run.runConfig as Record<string, unknown>)
        : {}
    const reasoning =
      typeof runConfig.reasoning === 'object' && runConfig.reasoning !== null
        ? (runConfig.reasoning as Record<string, unknown>)
        : {}

    return {
      id: asString(run.id, 'qaTry.id'),
      status: parseStatus(run.status),
      startedAt: asString(run.startedAt, 'qaTry.startedAt'),
      completedAt: asNullableString(run.completedAt),
      model: asNullableString(run.model),
      reasoningEffort: asNullableString(reasoning.effort),
      promptVersion: asNullableString(run.promptVersion),
      agentArch: asNullableString(run.agentArch),
      agentFingerprint: asNullableString(run.agentFingerprint),
    }
  })
}

/** 모르는 상태값은 목록 전체를 깨뜨리지 않고 `STARTING`으로 낮춘다. */
function parseStatus(value: unknown): QaTryStatus {
  return QA_TRY_STATUSES.find((status) => status === value) ?? 'STARTING'
}
