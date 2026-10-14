import { completionRate } from './pivot'
import { EMPTY_MARK } from '../shared/format'
import { useQa } from './useQa'
import type { QaStatsTotals } from './qaStatsTypes'

/**
 * 완주율 한 칸. 숫자가 뜻을 지고 막대는 눈으로 훑기 위한 장식이다.
 *
 * 막대에 색을 세 단계로 주지만 색만으로 말하지 않는다 — 같은 칸에 항상 백분율이 함께 있고,
 * 막대 자체는 `aria-hidden`이라 스크린리더에는 숫자만 간다.
 */
export function CompletionRate({ row }: { row: QaStatsTotals }) {
  const { t, fmt } = useQa()
  const rate = completionRate(row)

  if (rate === null) {
    // 판정된 런이 없다. 0%로 쓰면 "전부 실패"와 같은 글자가 된다.
    return <span className="muted">{EMPTY_MARK}</span>
  }

  const tone = rate >= 0.8 ? '' : rate >= 0.5 ? ' rate__fill--mixed' : ' rate__fill--poor'

  return (
    <span className="rate">
      <span className="rate__track" aria-hidden="true">
        <span className={`rate__fill${tone}`} style={{ width: `${Math.round(rate * 100)}%` }} />
      </span>
      <span title={t.completion.detail(row.completed, row.completed + row.failed)}>
        {fmt.rate(rate)}
      </span>
    </span>
  )
}
