import { useId } from 'react'

/**
 * ARTEL 로고(64×64). 정육각형 고리를 두 조각으로 나눈 모양이다 — 회색 몸통과, 오른쪽 아래 변인 코랄 조각.
 * 코랄 조각은 양 끝이 세로로 잘렸고, 몸통과는 아래 꼭짓점과 오른쪽 변 끝에서 가는 틈만큼 떨어져 있다.
 * 브랜드 원본(artel-logo-symbol-transparent.png)에서 잰 비율이다. `public/artel-mark.svg` 는 선으로 그린 근사라 쓰지 않는다.
 */
const MARK_BODY =
  'M 32 56 L 11.22 44 L 11.22 20 L 32 8 L 52.78 20 L 52.78 32.6 L 43.98 37.68 L 43.98 25.08 L 32 18.16 L 20.02 25.08 L 20.02 38.92 L 32 45.84 Z'
const MARK_ACCENT = 'M 35.2 54.15 L 52.78 44 L 52.78 35.2 L 35.2 45.35 Z'

/** 로고를 위에서 아래로 가르는 금. 로고 모양은 그대로 두고 금만 긋는다 — 조각을 움직이면 정육각형이 비틀린다. */
const CRACK = [
  [31, -2],
  [33, 4],
  [30, 9],
  [33, 13],
  [30, 18],
  [28, 30],
  [27, 48],
  [29, 52],
  [26, 56],
  [28, 64],
] as const
const crackPath = CRACK.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')

/**
 * 404 그림(ARTEL-1162). 위에 매달린 백열전구가 아래로 빛을 비추고, 그 빛 아래 ARTEL 로고에 금이 가 있다 — 찾던
 * 것이 여기서 깨졌다는 뜻. 로고는 `public/artel-mark.svg` 의 두 획을 그대로 쓰고 색은 테마 토큰을 따른다.
 * 빛은 가끔 깜빡이고, 움직임을 줄인 사용자에게는 멈춰 있다. 장식이라 `aria-hidden` 이다.
 */
export function BrokenLogoScene() {
  const id = useId().replace(/:/g, '')
  const beam = `nf-beam-${id}`
  const glow = `nf-glow-${id}`
  const bulb = `nf-bulb-${id}`
  const onMark = `nf-on-mark-${id}`

  return (
    <svg aria-hidden="true" className="nf-scene" fill="none" viewBox="0 0 480 430">
      <defs>
        <linearGradient id={beam} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--nf-light)" stopOpacity="0.42" />
          <stop offset="0.55" stopColor="var(--nf-light)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--nf-light)" stopOpacity="0" />
        </linearGradient>
        <radialGradient cx="0.5" cy="0.5" id={glow} r="0.5">
          <stop offset="0" stopColor="var(--nf-light)" stopOpacity="0.30" />
          <stop offset="1" stopColor="var(--nf-light)" stopOpacity="0" />
        </radialGradient>
        <radialGradient cx="0.5" cy="0.4" id={bulb} r="0.6">
          <stop offset="0" stopColor="#fff7e0" />
          <stop offset="0.6" stopColor="var(--nf-light)" />
          <stop offset="1" stopColor="var(--nf-light)" stopOpacity="0.6" />
        </radialGradient>
        {/* 금은 로고 획 위에만 보인다 — 가운데 빈 자리에 그으면 금이 아니라 낙서다. */}
        <mask id={onMark} maskContentUnits="userSpaceOnUse" maskUnits="userSpaceOnUse" x="-10" y="-10" width="90" height="90">
          <path d={MARK_BODY} fill="#fff" />
          <path d={MARK_ACCENT} fill="#fff" />
        </mask>
      </defs>

      {/* 빛: 전구에서 아래로 퍼지는 원뿔과 로고 둘레의 번짐 */}
      <g className="nf-light">
        <path d="M 206 92 L 274 92 L 452 430 L 28 430 Z" fill={`url(#${beam})`} />
        <ellipse cx="240" cy="300" fill={`url(#${glow})`} rx="170" ry="120" />
      </g>

      {/* 전구: 줄 · 갓 · 알 */}
      <path className="nf-cord" d="M 240 0 L 240 46" />
      <path className="nf-shade" d="M 240 44 Q 252 44 256 54 L 300 86 Q 240 96 180 86 L 224 54 Q 228 44 240 44 Z" />
      <circle className="nf-bulb-halo" cx="240" cy="96" r="22" />
      <circle cx="240" cy="94" fill={`url(#${bulb})`} r="10" />

      {/* 바닥 그림자와 떨어진 조각 */}
      <ellipse className="nf-floor" cx="240" cy="392" rx="120" ry="9" />
      <path className="nf-chip" d="M 300 384 l 7 -3 l 2 6 Z" />
      <path className="nf-chip" d="M 318 389 l 4 -2 l 1 4 Z" />
      <path className="nf-chip nf-chip--accent" d="M 284 388 l 6 -1 l -2 5 Z" />

      {/* 금 간 로고: 모양 · 비율은 원본 그대로, 그 위에 금만 */}
      <g transform="translate(144 196) scale(3)">
        <path className="nf-mark" d={MARK_BODY} />
        <path className="nf-mark-accent" d={MARK_ACCENT} />
        {/* 갈라진 틈과 가는 잔금 */}
        <g mask={`url(#${onMark})`}>
          <path className="nf-crack" d={crackPath} />
          <path className="nf-crack nf-crack--thin" d="M 33 4 L 37 9 L 40 8 L 44 13 M 9 30 L 12 32 L 14 29 L 17 33 L 19 30 L 22 32 M 42 28 L 45 26 L 48 29 L 51 26 L 55 28 M 41 43 L 44 46 L 43 49 L 46 51" />
        </g>
      </g>
    </svg>
  )
}
