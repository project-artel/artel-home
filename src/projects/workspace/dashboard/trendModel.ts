/**
 * QA 판정 추이가 그리는 숫자(ARTEL-1387). 서버 칸(`qaVerdictTrendApi`)을 받아 빈 날을 채우고, 통과율 · 7칸 평균 ·
 * 요약을 접는다. 같은 입력이면 늘 같은 출력이라 테스트가 화면 없이 숫자를 잡는다.
 */
import type { TrendBucket, TrendBucketUnit, TrendBuild } from './qaVerdictTrendApi'

export type TrendSlot = TrendBucket & {
  /** 통과 + 실패 + 회귀. 미판정은 들지 않는다. */
  judged: number
  /** 통과 ÷ [judged]. 판정이 없으면 null. */
  passRate: number | null
}

const DAY_MS = 86_400_000

/** [at] 이 [timeZone] 에서 드는 날(`yyyy-MM-dd`). 서버의 날 열쇠와 같은 모양이다. */
export function dayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

const keyToUtc = (key: string) => Date.parse(`${key}T00:00:00Z`)
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** 그 날이 든 주의 월요일 열쇠. 서버의 `date_trunc('week')` 와 같다. */
export function weekKey(day: string): string {
  const ms = keyToUtc(day)
  const weekday = (new Date(ms).getUTCDay() + 6) % 7
  return utcToKey(ms - weekday * DAY_MS)
}

function slotOf(bucket: TrendBucket): TrendSlot {
  const judged = bucket.passed + bucket.failed + bucket.regression
  return { ...bucket, judged, passRate: judged === 0 ? null : bucket.passed / judged }
}

const empty = (key: string): TrendBucket => ({ key, startedAt: null, runs: 0, passed: 0, failed: 0, regression: 0, undecided: 0, topFailing: null })

/**
 * 칸을 시간순으로 늘어놓는다. 날 · 주는 [from] ~ [to] 사이의 빈 칸을 0 으로 채운다 — 판정이 없던 날이 빠지면 막대
 * 간격이 날짜 간격과 달라진다. 실행마다는 실행이 곧 칸이라 채우지 않는다.
 */
export function trendSlots(buckets: readonly TrendBucket[], unit: TrendBucketUnit, from: Date, to: Date, timeZone: string): TrendSlot[] {
  if (unit === 'RUN') return buckets.map(slotOf)
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  const first = dayKey(from, timeZone)
  const last = dayKey(new Date(to.getTime() - 1), timeZone)
  const keys: string[] = []
  const step = unit === 'WEEK' ? 7 * DAY_MS : DAY_MS
  for (let ms = keyToUtc(unit === 'WEEK' ? weekKey(first) : first); ms <= keyToUtc(last); ms += step) keys.push(utcToKey(ms))
  return keys.map((key) => slotOf(byKey.get(key) ?? empty(key)))
}

/** 칸마다 앞 [window] 칸(자신 포함)을 합친 통과율. 칸마다 통과율을 평균하지 않는다 — 판정 1건짜리 날이 20건짜리 날과 같은 무게가 된다. */
export function rollingPassRate(slots: readonly TrendSlot[], window = 7): (number | null)[] {
  return slots.map((_, index) => {
    const part = slots.slice(Math.max(0, index - window + 1), index + 1)
    const judged = part.reduce((sum, slot) => sum + slot.judged, 0)
    return judged === 0 ? null : part.reduce((sum, slot) => sum + slot.passed, 0) / judged
  })
}

/** 칸이 시작하는 시각. 날 · 주는 열쇠의 그 날(시간대의 자정과 몇 시간 어긋나도 칸을 고르기에는 충분하다). */
export function slotStart(slot: Pick<TrendSlot, 'key' | 'startedAt'>, unit: TrendBucketUnit): number {
  return unit === 'RUN' ? Date.parse(slot.startedAt ?? '') : keyToUtc(slot.key)
}

/** 빌드가 올라온 칸의 자리. 기간 밖이면 뺀다. 같은 칸에 둘이 오르면 둘 다 그 칸이다. */
export function buildMarks(slots: readonly TrendSlot[], builds: readonly TrendBuild[], unit: TrendBucketUnit, timeZone: string): { index: number; build: TrendBuild }[] {
  const marks: { index: number; build: TrendBuild }[] = []
  for (const build of builds) {
    const at = new Date(build.createdAt)
    if (Number.isNaN(at.getTime())) continue
    let index: number
    if (unit === 'RUN') index = slots.findIndex((slot) => Date.parse(slot.startedAt ?? '') >= at.getTime())
    else {
      const key = unit === 'WEEK' ? weekKey(dayKey(at, timeZone)) : dayKey(at, timeZone)
      index = slots.findIndex((slot) => slot.key === key)
    }
    if (index >= 0) marks.push({ index, build })
  }
  return marks
}

export type TrendSummary = {
  judged: number
  runs: number
  /** 칸 하나에 평균 판정 수. */
  perSlot: number
  passRate: number | null
  /** 바로 앞 같은 길이 기간의 통과율. 판정이 없었으면 null. */
  previousPassRate: number | null
  failed: number
  regression: number
  undecided: number
  /** 미판정이 가장 많았던 칸. 미판정이 없으면 null. */
  undecidedPeak: TrendSlot | null
  /** 통과율이 가장 낮았던 칸. 판정이 [minJudged] 건 넘는 칸만 본다 — 1건 실패한 날이 늘 꼴찌가 된다. */
  worst: TrendSlot | null
  /** [worst] 직전에 올라온 빌드와 그 뒤로 지난 날. */
  worstAfter: { build: TrendBuild; days: number } | null
}

export function summarizeTrend(
  slots: readonly TrendSlot[],
  previous: readonly TrendSlot[],
  builds: readonly TrendBuild[],
  unit: TrendBucketUnit,
  timeZone: string,
  { minJudged = 3 }: { minJudged?: number } = {},
): TrendSummary {
  const sum = (list: readonly TrendSlot[], pick: (slot: TrendSlot) => number) => list.reduce((total, slot) => total + pick(slot), 0)
  const judged = sum(slots, (slot) => slot.judged)
  const previousJudged = sum(previous, (slot) => slot.judged)
  const undecidedPeak = slots.reduce<TrendSlot | null>((best, slot) => (slot.undecided > 0 && (best === null || slot.undecided > best.undecided) ? slot : best), null)
  const worst = slots.reduce<TrendSlot | null>(
    (best, slot) => (slot.passRate !== null && slot.judged >= minJudged && (best === null || slot.passRate < (best.passRate ?? 1)) ? slot : best),
    null,
  )
  let worstAfter: TrendSummary['worstAfter'] = null
  if (worst !== null) {
    // 날 · 주는 날 열쇠끼리 견준다 — 시각으로 견주면 시간대만큼 하루가 어긋난다.
    const builtBy = (build: TrendBuild) =>
      unit === 'RUN' ? Date.parse(build.createdAt) <= slotStart(worst, unit) : dayKey(new Date(build.createdAt), timeZone) <= worst.key
    const before = builds.filter(builtBy).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (before !== undefined) {
      const worstDay = unit === 'RUN' ? keyToUtc(dayKey(new Date(slotStart(worst, unit)), timeZone)) : keyToUtc(worst.key)
      worstAfter = { build: before, days: Math.max(0, Math.round((worstDay - keyToUtc(dayKey(new Date(before.createdAt), timeZone))) / DAY_MS)) }
    }
  }
  return {
    judged,
    runs: sum(slots, (slot) => slot.runs),
    perSlot: slots.length === 0 ? 0 : judged / slots.length,
    passRate: judged === 0 ? null : sum(slots, (slot) => slot.passed) / judged,
    previousPassRate: previousJudged === 0 ? null : sum(previous, (slot) => slot.passed) / previousJudged,
    failed: sum(slots, (slot) => slot.failed),
    regression: sum(slots, (slot) => slot.regression),
    undecided: sum(slots, (slot) => slot.undecided),
    undecidedPeak,
    worst,
    worstAfter,
  }
}

/** 서버에서 받은 두 기간치 칸을 이번 기간과 그 앞 기간으로 가른다. */
export function splitAt(slots: readonly TrendSlot[], since: Date, unit: TrendBucketUnit, timeZone: string): { current: TrendSlot[]; previous: TrendSlot[] } {
  const isCurrent =
    unit === 'RUN'
      ? (slot: TrendSlot) => Date.parse(slot.startedAt ?? '') >= since.getTime()
      : (slot: TrendSlot) => slot.key >= (unit === 'WEEK' ? weekKey(dayKey(since, timeZone)) : dayKey(since, timeZone))
  return { current: slots.filter(isCurrent), previous: slots.filter((slot) => !isCurrent(slot)) }
}

/** `2026-10-23` → `10/23`. */
export function shortKey(key: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(key)
  return match ? `${Number(match[1])}/${Number(match[2])}` : key
}
