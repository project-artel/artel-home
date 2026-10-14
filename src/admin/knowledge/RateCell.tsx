import { useI18n } from '../../i18n/useI18n'
import { adminFormat, EMPTY_MARK } from '../shared/format'

/**
 * 비율 한 칸. 숫자가 뜻을 지고 막대는 눈으로 훑기 위한 장식이다.
 *
 * `qaStats/CompletionRate`와 같은 마크업을 쓰되 방향을 받는다. 지식 지표에는 높을수록 좋은 값
 * (인용률)과 낮을수록 좋은 값(후속 런이 지운 비율)이 함께 있어서, 색을 한 방향으로 고정하면
 * 둘 중 하나는 반드시 거꾸로 칠해진다.
 *
 * 색만으로 말하지 않는다 — 같은 칸에 항상 백분율이 있고 막대는 `aria-hidden`이다.
 */
export function RateCell({
  rate,
  higherIsBetter = true,
  title,
  unknownHint,
}: {
  rate: number | null
  higherIsBetter?: boolean
  title?: string
  /** 값이 없을 때 왜 없는지. 0%와 구분되는 이유를 이 자리에서 말한다. */
  unknownHint?: string
}) {
  const { locale } = useI18n()
  const format = adminFormat(locale)

  if (rate === null) {
    return (
      <span className="muted" title={unknownHint}>
        {EMPTY_MARK}
      </span>
    )
  }

  // 좋고 나쁨의 방향만 뒤집는다. 임계값은 qaStats의 완주율과 같은 0.8 / 0.5다.
  const goodness = higherIsBetter ? rate : 1 - rate
  const tone = goodness >= 0.8 ? '' : goodness >= 0.5 ? ' rate__fill--mixed' : ' rate__fill--poor'

  return (
    <span className="rate">
      <span className="rate__track" aria-hidden="true">
        <span className={`rate__fill${tone}`} style={{ width: `${Math.round(rate * 100)}%` }} />
      </span>
      <span title={title}>{format.rate(rate)}</span>
    </span>
  )
}
