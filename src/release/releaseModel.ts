import type { BuildVerificationDay, BuildVerificationSummary, ReleaseCriteria } from './releaseApi'

/*
 * 출시 판단(ARTEL-1387). 기준 다섯은 고정이고 숫자만 프로젝트가 정한다. 대시보드와 설정의 미리 보기가 같은 함수를
 * 쓴다 — 설정이 저장 전 숫자로 지금 빌드와 지난 빌드를 다시 판정한다.
 */

export type GateKey = 'pending' | 'regression' | 'passRate' | 'blockers' | 'inconclusive'

export type Gate = {
  key: GateKey
  /** 지금 값. 비율은 0~100 의 정수 % 다. */
  value: number
  limit: number
  /** `max` 면 값이 기준 이하, `min` 이면 이상이어야 충족이다. */
  kind: 'max' | 'min'
  unit: 'count' | 'percent'
  met: boolean
}

/** `verifying` 판정 전 TC 가 기준보다 많음 · `candidate` 판정 전은 기준 안, 다른 기준 미달 · `ready` 모두 충족. */
export type ReleaseLevel = 'verifying' | 'candidate' | 'ready'

export type Readiness = { level: ReleaseLevel; met: number; gates: Gate[] }

export const RELEASE_LEVELS: readonly ReleaseLevel[] = ['verifying', 'candidate', 'ready']

/** 판정한 TC(판정 전이 아닌 것) 수. */
export function judgedOf(summary: Pick<BuildVerificationSummary, 'passed' | 'failed' | 'regression' | 'inconclusive'>): number {
  return summary.passed + summary.failed + summary.regression + summary.inconclusive
}

/**
 * 통과율은 내림, 판정 못함 비율은 올림한다 — 화면에 보인 % 와 충족 여부가 어긋나지 않게(94.6% 를 95% 로 보이고
 * 95% 기준에 미달이라 하지 않게).
 */
export function passRateOf(summary: Pick<BuildVerificationSummary, 'passed' | 'failed' | 'regression' | 'inconclusive'>): number {
  const judged = judgedOf(summary)
  return judged === 0 ? 0 : Math.floor((summary.passed * 100) / judged)
}

export function inconclusiveRateOf(summary: Pick<BuildVerificationSummary, 'inconclusive' | 'total'>): number {
  return summary.total === 0 ? 0 : Math.ceil((summary.inconclusive * 100) / summary.total)
}

export function evaluateRelease(summary: BuildVerificationSummary, criteria: ReleaseCriteria): Readiness {
  const gate = (key: GateKey, value: number, limit: number, kind: Gate['kind'], unit: Gate['unit']): Gate => ({
    key,
    value,
    limit,
    kind,
    unit,
    met: kind === 'max' ? value <= limit : value >= limit,
  })
  const gates = [
    gate('pending', summary.pending, criteria.maxPending, 'max', 'count'),
    gate('regression', summary.regression, criteria.maxRegression, 'max', 'count'),
    gate('passRate', passRateOf(summary), criteria.minPassRate, 'min', 'percent'),
    gate('blockers', summary.openBlockers, criteria.maxOpenBlockers, 'max', 'count'),
    gate('inconclusive', inconclusiveRateOf(summary), criteria.maxInconclusiveRate, 'max', 'percent'),
  ]
  const met = gates.filter((one) => one.met).length
  const level: ReleaseLevel = met === gates.length ? 'ready' : gates[0].met ? 'candidate' : 'verifying'
  return { level, met, gates }
}

/**
 * 남은 TC 를 다 판정하기까지 걸릴 날. 최근 7일(날이 적으면 있는 만큼) 하루 평균 판정 수로 나눈다. 사흘치가 안
 * 쌓였거나 판정이 늘지 않았으면 null 이다.
 */
export function daysToFinish(days: readonly BuildVerificationDay[], pending: number): { days: number; perDay: number } | null {
  if (pending === 0 || days.length < 3) return null
  const recent = days.slice(-8)
  const perDay = (judgedOf(recent[recent.length - 1]) - judgedOf(recent[0])) / (recent.length - 1)
  if (perDay <= 0) return null
  return { days: Math.max(1, Math.round(pending / perDay)), perDay }
}
