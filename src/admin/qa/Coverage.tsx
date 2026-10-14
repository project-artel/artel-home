import { EMPTY_MARK } from '../shared/format'
import { useQa } from './useQa'

/**
 * 커버리지 한 칸 — 옆 비율들이 몇 개의 런 위에 얹혀 있는지.
 *
 * **이 화면에서 이 숫자를 숨기는 것이 가장 조용한 오류다.** 합격률은 값이 있는 런만으로
 * 계산되므로 "깔끔하게 종료된 런"에 조건부이고, 잘 죽는 설정일수록 자기 최악 런이 빠져 편향
 * 크기가 축마다 다르다. 두 설정을 나란히 놓고 비교하려면 분모가 같은 자리에 있어야 한다.
 *
 * 0일 때는 백분율 대신 글자로 말한다. `0.0%`는 옆 칸의 `—`와 함께 읽히면 "점수가 0"으로 읽히기
 * 쉬운데, 실제로는 잴 것이 없었다는 뜻이다.
 */
export function Coverage({ known, runs, nothing }: { known: number; runs: number; nothing: string }) {
  const { t, fmt } = useQa()
  if (runs === 0) {
    return <span className="muted">{EMPTY_MARK}</span>
  }
  if (known === 0) {
    return <span className="coverage coverage--none">{nothing}</span>
  }

  const rate = known / runs
  return (
    <span
      className={rate < 1 ? 'coverage coverage--partial' : 'coverage'}
      title={t.coverage.detail(fmt.count(known), fmt.count(runs))}
    >
      {fmt.rate(rate)}
      <span className="coverage__detail">
        {fmt.count(known)}/{fmt.count(runs)}
      </span>
    </span>
  )
}
