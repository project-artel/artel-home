import { EMPTY_MARK } from '../shared/format'
import { useQa } from './useQa'

/**
 * 어느 방향이 좋은 값인지. `CompletionRate`처럼 "높을수록 좋다"를 가정할 수 없어서 명시한다 —
 * 미탐률과 오탐률은 낮을수록 좋고, 같은 색 규칙을 쓰면 최악의 설정이 초록으로 칠해진다.
 *
 * boolean 조합이 아니라 변형 이름을 쓰는 것은 DESIGN.md의 규칙이다.
 */
export type RatePolarity = 'higher-better' | 'lower-better'

/**
 * 비율 한 칸. 숫자가 뜻을 지고 막대는 눈으로 훑기 위한 장식이다(`CompletionRate`와 같은 규약).
 *
 * 막대는 `aria-hidden`이고 백분율이 언제나 같은 칸에 있다 — 색과 길이만으로 말하면 색각 이상과
 * 스크린리더 양쪽에서 사라진다.
 *
 * @param rate null이면 분모가 없다는 뜻이다. **0%로 그리지 않는다** — "재 봤더니 0"과 "잴 것이
 *   없었다"는 다른 사실이고, 후자를 0으로 칠하면 아무것도 안 한 설정이 최고점으로 보인다.
 * @param detail 분자와 분모를 사람이 읽는 문장. 비율만 보고 몇 개 위에 얹힌 값인지 모르는 일을
 *   막는다.
 */
export function ScoreRate({
  rate,
  detail,
  polarity = 'higher-better',
}: {
  rate: number | null
  detail: string
  polarity?: RatePolarity
}) {
  const { fmt } = useQa()
  if (rate === null) {
    return <span className="muted">{EMPTY_MARK}</span>
  }

  // 좋음의 방향만 뒤집고 경계값은 같게 둔다. 두 지표가 다른 경계를 쓰면 같은 색이 다른 뜻이 된다.
  const good = polarity === 'higher-better' ? rate : 1 - rate
  const tone = good >= 0.8 ? '' : good >= 0.5 ? ' rate__fill--mixed' : ' rate__fill--poor'

  return (
    <span className="rate">
      <span className="rate__track" aria-hidden="true">
        <span className={`rate__fill${tone}`} style={{ width: `${Math.round(rate * 100)}%` }} />
      </span>
      <span title={detail}>{fmt.rate(rate)}</span>
    </span>
  )
}
