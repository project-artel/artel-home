import { toneOfRatio } from './history/historyModel'
import type { QaTry } from './qaTypes'

/** 끝난 시나리오의 TC 통과 비율. 색은 히스토리 통과율 링과 같은 기준이다(`toneOfRatio`). */
export type CaseRatio = {
  passed: number
  total: number
  percent: number
  tone: 'pass' | 'partial' | 'fail'
}

type Counted = Pick<QaTry, 'casesPassed' | 'casesTotal'> & { status: string }

/**
 * 시나리오를 통과 · 실패 한 단어로 보이지 않고 `통과/전체` 로 보일 재료. TC 하나만 실패해도 `FAILED` 가 되어 시나리오
 * 전체가 빨간 "실패" 로 보이던 것을 바꾼다. 판정으로 끝난(COMPLETED · FAILED) 시나리오에 판정한 TC 가 있을 때만 낸다 —
 * 진행 중 · 취소 · 미판정이거나 TC 가 없으면 null 이고, 화면은 종전처럼 상태 이름을 보인다.
 */
export function caseRatioOf(entry: Counted): CaseRatio | null {
  if (entry.status !== 'COMPLETED' && entry.status !== 'FAILED') return null
  const { casesPassed: passed, casesTotal: total } = entry
  if (passed === null || total === null || total === 0) return null
  return ratioOf(passed, total)
}

/** 여러 시나리오를 합친 비율(런 머리줄). 비율을 낼 수 있는 시나리오가 하나도 없으면 null 이다. */
export function runCaseRatioOf(tries: readonly Counted[]): CaseRatio | null {
  const ratios = tries.map(caseRatioOf).filter((ratio): ratio is CaseRatio => ratio !== null)
  if (ratios.length === 0) return null
  return ratioOf(
    ratios.reduce((sum, ratio) => sum + ratio.passed, 0),
    ratios.reduce((sum, ratio) => sum + ratio.total, 0),
  )
}

function ratioOf(passed: number, total: number): CaseRatio {
  const ratio = passed / total
  return { passed, total, percent: Math.round(ratio * 100), tone: toneOfRatio(ratio) }
}
