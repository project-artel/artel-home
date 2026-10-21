/**
 * 대시보드가 그리는 숫자(ARTEL-1164). 화면이 받은 응답을 그대로 넘기면 여기서 접는다 — 서버를 더 부르지 않고,
 * 같은 입력이면 늘 같은 출력이라 테스트가 화면 없이 숫자를 잡는다.
 */
import type { VerificationStatus } from '../../../testCases/testCaseTypes'
import type { VersionCaseRow } from '../../../testCases/testCaseVersions'

/** 최신 빌드의 판정 전 TC 를, 이전 빌드에서의 결과로 나눈다. 무엇부터 볼지가 보이게. */
export type RemainingSplit = {
  /** 이전 빌드에서 실패 · 회귀였다 — 고쳐졌는지 확인. */
  wasFailing: string[]
  /** 이전 빌드에서 통과했다 — 회귀 확인. */
  wasPassing: string[]
  /** 이전에도 판정이 없었거나 이전 빌드에 없던 TC. */
  firstTime: string[]
}

/** 두 빌드의 판정을 나란히 놓은 결과. */
export type VersionComparison = {
  total: number
  current: StatusCounts
  previous: StatusCounts | null
  remaining: RemainingSplit
  /** 실패 · 회귀 → 통과. */
  fixed: number
  /** 통과 → 실패 · 회귀. */
  broke: number
  /** 둘 다 실패 · 회귀. */
  stillFailing: number
  /** 이전 빌드에만 있는 TC. */
  dropped: number
  /** 이번 빌드에만 있는 TC. */
  added: number
}

export type StatusCounts = { passed: number; failed: number; regression: number; pending: number; broken: number }

const isFailing = (status: VerificationStatus | null) => status === 'FAILED' || status === 'REGRESSION'
const isPending = (status: VerificationStatus | null) => status === null || status === 'DRAFT'

function count(statuses: (VerificationStatus | null)[]): StatusCounts {
  const out: StatusCounts = { passed: 0, failed: 0, regression: 0, pending: 0, broken: 0 }
  for (const status of statuses) {
    if (status === 'VERIFIED') out.passed++
    else if (status === 'FAILED') out.failed++
    else if (status === 'REGRESSION') out.regression++
    else if (status === 'BROKEN') out.broken++
    else out.pending++
  }
  return out
}

/**
 * [rows] 는 `listVersionCases(현재, 이전)` 의 응답이다. [compared] 가 false 면 비교 빌드가 없다(빌드가 하나뿐).
 */
export function compareVersions(rows: readonly VersionCaseRow[], compared: boolean): VersionComparison {
  const inCurrent = rows.filter((row) => row.presence !== 'ONLY_OTHER')
  const inPrevious = rows.filter((row) => row.presence !== 'ONLY_THIS')
  const remaining: RemainingSplit = { wasFailing: [], wasPassing: [], firstTime: [] }
  let fixed = 0
  let broke = 0
  let stillFailing = 0
  for (const row of inCurrent) {
    const now = row.verificationStatus
    const before = compared && row.presence === 'BOTH' ? row.compareVerificationStatus : null
    if (isPending(now)) {
      if (isFailing(before)) remaining.wasFailing.push(row.testCase.id)
      else if (before === 'VERIFIED') remaining.wasPassing.push(row.testCase.id)
      else remaining.firstTime.push(row.testCase.id)
      continue
    }
    if (isFailing(before) && now === 'VERIFIED') fixed++
    else if (before === 'VERIFIED' && isFailing(now)) broke++
    else if (isFailing(before) && isFailing(now)) stillFailing++
  }
  return {
    total: inCurrent.length,
    current: count(inCurrent.map((row) => row.verificationStatus)),
    previous: compared ? count(inPrevious.map((row) => row.compareVerificationStatus)) : null,
    remaining,
    fixed,
    broke,
    stillFailing,
    dropped: compared ? rows.filter((row) => row.presence === 'ONLY_OTHER').length : 0,
    added: compared ? rows.filter((row) => row.presence === 'ONLY_THIS').length : 0,
  }
}

export type TryOutcome = 'PASS' | 'FAIL' | 'CANCEL' | 'RUNNING'

export type ScenarioHistory = {
  testScenarioId: string
  title: string
  /** 오래된 것 → 최근, 최대 [limit] 개. */
  outcomes: TryOutcome[]
  /** 꼬리표. */
  verdict: 'ALWAYS_FAILING' | 'BROKE_AGAIN' | 'FLAKY' | 'PASSING' | 'UNKNOWN'
}

function outcomeOf(status: string): TryOutcome {
  if (status === 'COMPLETED') return 'PASS'
  if (status === 'FAILED') return 'FAIL'
  if (status === 'RUNNING' || status === 'STARTING' || status === 'PENDING') return 'RUNNING'
  return 'CANCEL'
}

/**
 * 시나리오별 최근 결과(BrowserStack 의 "Always failing · Flaky" 줄과 같은 것). 실패가 많은 시나리오가 위에 온다.
 * 꼬리표: 판정된 것이 모두 실패면 계속 실패, 통과한 뒤로 실패만이면 다시 깨짐, 섞이면 들쭉날쭉, 모두 통과면 통과.
 */
export function scenarioHistories(
  tries: readonly { testScenarioId: string; status: string; startedAt: string | null }[],
  titleOf: (testScenarioId: string) => string | null,
  { limit = 10, max = 5 }: { limit?: number; max?: number } = {},
): ScenarioHistory[] {
  const byScenario = new Map<string, { status: string; startedAt: string }[]>()
  for (const item of tries) {
    const list = byScenario.get(item.testScenarioId) ?? []
    list.push({ status: item.status, startedAt: item.startedAt ?? '' })
    byScenario.set(item.testScenarioId, list)
  }
  const rows: (ScenarioHistory & { fails: number })[] = []
  for (const [testScenarioId, list] of byScenario) {
    const outcomes = [...list].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-limit).map((one) => outcomeOf(one.status))
    const judged = outcomes.filter((outcome) => outcome === 'PASS' || outcome === 'FAIL')
    const lastPass = judged.lastIndexOf('PASS')
    const verdict: ScenarioHistory['verdict'] =
      judged.length === 0
        ? 'UNKNOWN'
        : judged.every((outcome) => outcome === 'FAIL')
          ? 'ALWAYS_FAILING'
          : judged.every((outcome) => outcome === 'PASS')
            ? 'PASSING'
            : lastPass >= 0 && lastPass < judged.length - 1 && judged.slice(lastPass + 1).every((outcome) => outcome === 'FAIL')
              ? 'BROKE_AGAIN'
              : 'FLAKY'
    rows.push({
      testScenarioId,
      title: titleOf(testScenarioId) ?? `#${testScenarioId}`,
      outcomes,
      verdict,
      fails: judged.filter((outcome) => outcome === 'FAIL').length,
    })
  }
  return rows
    .sort((a, b) => b.fails - a.fails || b.outcomes.length - a.outcomes.length)
    .slice(0, max)
    .map((row) => ({ testScenarioId: row.testScenarioId, title: row.title, outcomes: row.outcomes, verdict: row.verdict }))
}

export type CostPoint = { qaRunId: string; startedAt: string; build: string; tokens: number; costUsd: number | null }

/**
 * 실행마다 토큰 · 비용. 사용량 응답은 시도(qa_try) 단위이고 실행 · 빌드가 없어서, 시도 → 실행(tries 의 qaRunId) →
 * 빌드(실행 목록의 gameBuildVersion)로 잇는다. 이을 수 없는 시도와 토큰이 0 인 실행은 뺀다. 오래된 실행이 앞.
 */
export function costByRun(
  usage: readonly { qaTryId: string; totals: { inputTokens: number; outputTokens: number; costUsd: number | null } }[],
  runOfTry: ReadonlyMap<string, string | null>,
  runs: readonly { id: string; startedAt: string; gameBuildVersion: string | null }[],
): CostPoint[] {
  const runById = new Map(runs.map((run) => [run.id, run]))
  const byRun = new Map<string, CostPoint>()
  for (const row of usage) {
    const runId = runOfTry.get(row.qaTryId)
    const run = runId ? runById.get(runId) : undefined
    if (!run) continue
    const point = byRun.get(run.id) ?? { qaRunId: run.id, startedAt: run.startedAt, build: run.gameBuildVersion ?? '—', tokens: 0, costUsd: 0 }
    point.tokens += row.totals.inputTokens + row.totals.outputTokens
    point.costUsd = point.costUsd === null || row.totals.costUsd === null ? null : point.costUsd + row.totals.costUsd
    byRun.set(run.id, point)
  }
  // 모델을 안 부른 실행(토큰 0)은 점이 아니다 — 0 에 찍으면 쓴 적 없는 빌드가 범례에 생긴다.
  return [...byRun.values()].filter((point) => point.tokens > 0).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** [now] 가 든 주를 끝으로 [weeks] 주. 주는 월요일에 시작한다. */
export function weekStarts(now: Date, weeks: number): Date[] {
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return Array.from({ length: weeks }, (_, index) => {
    const start = new Date(monday)
    start.setDate(monday.getDate() - (weeks - 1 - index) * 7)
    return start
  })
}

/** 주마다 [dates] 에 든 수. 범위 밖은 세지 않는다. */
export function countByWeek(dates: readonly (string | null)[], starts: readonly Date[]): number[] {
  const counts = starts.map(() => 0)
  const end = new Date(starts[starts.length - 1])
  end.setDate(end.getDate() + 7)
  for (const value of dates) {
    if (!value) continue
    const at = new Date(value)
    if (Number.isNaN(at.getTime()) || at < starts[0] || at >= end) continue
    let index = starts.length - 1
    while (index > 0 && at < starts[index]) index--
    counts[index]++
  }
  return counts
}

/** 날짜(로컬)마다 [dates] 에 든 수, [days] 일. 마지막 날이 [now]. */
export function countByDay(dates: readonly (string | null)[], now: Date, days: number): number[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const counts = Array.from({ length: days }, () => 0)
  for (const value of dates) {
    if (!value) continue
    const at = new Date(value)
    at.setHours(0, 0, 0, 0)
    const back = Math.round((today.getTime() - at.getTime()) / 86_400_000)
    if (back >= 0 && back < days) counts[days - 1 - back]++
  }
  return counts
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

export function shortDay(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : `${at.getMonth() + 1}/${at.getDate()}`
}
