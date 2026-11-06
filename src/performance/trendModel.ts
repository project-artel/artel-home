import { budgetRatio, isLowConfidence, type BuildPerformanceRun } from './performanceTypes'

/**
 * 빌드 화면의 추세 차트가 바꿔 볼 수 있는 지표(ARTEL-1207). 모두 계약이 이미 런마다 보내는 값이다.
 *
 * `hitchesPerMinute` 가 기본인 까닭은 그대로다: 런 길이가 달라도 비교된다. 나머지는 같은 런을 다른 축으로 본다.
 */
export const TREND_METRICS = ['hitchesPerMinute', 'p95BudgetRatio', 'onePercentLowFps', 'workingSetBytesMax'] as const

export type TrendMetric = (typeof TREND_METRICS)[number]

/**
 * 런 하나의 지표 값. `null` 은 그 런이 그 값을 재지 못했다는 뜻이라 0 으로 바꾸지 않는다.
 * 예산을 정하지 못한 런의 예산 대비도 `null` 이다.
 */
export function trendValue(run: BuildPerformanceRun, metric: TrendMetric): number | null {
  switch (metric) {
    case 'hitchesPerMinute':
      return run.hitchesPerMinute
    case 'p95BudgetRatio':
      return budgetRatio(run.frameP95Ms, run.budgetMs)
    case 'onePercentLowFps':
      return run.onePercentLowFps
    case 'workingSetBytesMax':
      return run.workingSetBytesMax
  }
}

/** 낮을수록 좋은 지표인가. 직전 런 대비 화살표 색을 정한다. */
export function lowerIsBetter(metric: TrendMetric): boolean {
  return metric !== 'onePercentLowFps'
}

/**
 * 축 위 끝을 읽기 좋은 수(1 · 2 · 2.5 · 5 · 10 의 10 거듭제곱 배)로 올린다. 눈금 라벨이 늘 그 차트가 닿는 값이 되게 한다.
 */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= value) return step * power
  }
  return 10 * power
}

/** 0 부터 `top` 까지 같은 간격 눈금. `count` 는 칸 수라 눈금은 `count + 1` 개다. */
export function axisTicks(top: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (top * index) / count)
}

/** 빌드 목록 한 줄이 쓰는 요약. 런이 없으면 `latest` 가 null 이다. */
export type BuildDigest = {
  runCount: number
  /** 가장 최근 런의 분당 hitch. */
  latest: number | null
  /** 미니 추세. 신뢰할 수 있는 런만, 시간순. 비교 주의 런을 섞으면 미니 그래프가 없던 회귀를 그린다. */
  spark: number[]
}

/** `runs` 는 시간순이어야 한다(`sortByStartedAt`). */
export function buildDigest(runs: readonly BuildPerformanceRun[]): BuildDigest {
  return {
    runCount: runs.length,
    latest: runs.length === 0 ? null : runs[runs.length - 1].hitchesPerMinute,
    spark: runs.filter((run) => !isLowConfidence(run)).map((run) => run.hitchesPerMinute),
  }
}

/**
 * 요약 칸이 비교하는 두 런: 가장 최근 런과 그 직전 런. 런이 하나면 직전이 없다.
 * 직전 런이 비교 주의여도 고르는 규칙은 같다. 그 사실은 신뢰도 칸이 따로 말한다.
 */
export function latestPair<T>(runs: readonly T[]): { latest: T | null; previous: T | null } {
  return {
    latest: runs.at(-1) ?? null,
    previous: runs.length >= 2 ? runs[runs.length - 2] : null,
  }
}

/** 둘 다 있을 때만 차이를 낸다. 한쪽이 측정 안 됨이면 차이도 없다. */
export function difference(latest: number | null, previous: number | null): number | null {
  return latest === null || previous === null ? null : latest - previous
}
