import { useId } from 'react'

/** 로고 두 획(`public/artel-mark.svg` 와 같은 좌표, 64×64). */
const MARK_BODY = 'M 52 40 L 52 18 L 32 6 L 12 18 L 12 46 L 30 56'
const MARK_ACCENT = 'M 36 56 L 52 46'

/** 로고를 위에서 아래로 가르는 금. 왼쪽 조각과 오른쪽 조각이 이 선에서 나뉜다. */
const CRACK = [
  [31, -2],
  [33, 4],
  [30, 8],
  [33, 13],
  [28, 30],
  [27, 48],
  [29, 52],
  [26, 56],
  [28, 64],
] as const
const crackPath = CRACK.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
const leftPiece = `M -8 -8 L ${CRACK.map(([x, y]) => `${x} ${y}`).join(' L ')} L 28 72 L -8 72 Z`
const rightPiece = `M 72 -8 L ${CRACK.map(([x, y]) => `${x} ${y}`).join(' L ')} L 28 72 L 72 72 Z`

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
  const left = `nf-left-${id}`
  const right = `nf-right-${id}`
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
        <clipPath id={left}>
          <path d={leftPiece} />
        </clipPath>
        <clipPath id={right}>
          <path d={rightPiece} />
        </clipPath>
        {/* 금은 로고 획 위에만 보인다 — 가운데 빈 자리에 그으면 금이 아니라 낙서다. */}
        <mask id={onMark} maskContentUnits="userSpaceOnUse" maskUnits="userSpaceOnUse" x="-10" y="-10" width="90" height="90">
          <path d={MARK_BODY} stroke="#fff" strokeWidth="9" />
          <path d={MARK_ACCENT} stroke="#fff" strokeWidth="9" />
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

      {/* 금 간 로고: 왼쪽 조각은 제자리, 오른쪽 조각은 살짝 내려앉았다 */}
      <g transform="translate(144 196) scale(3)">
        <g clipPath={`url(#${left})`}>
          <path className="nf-mark" d={MARK_BODY} />
          <path className="nf-mark-accent" d={MARK_ACCENT} />
        </g>
        <g clipPath={`url(#${right})`} transform="translate(0.7 1.1) rotate(1 34 40)">
          <path className="nf-mark" d={MARK_BODY} />
          <path className="nf-mark-accent" d={MARK_ACCENT} />
        </g>
        {/* 갈라진 틈과 가는 잔금 */}
        <g mask={`url(#${onMark})`}>
          <path className="nf-crack" d={crackPath} />
          <path className="nf-crack nf-crack--thin" d="M 33 5 L 37 9 L 40 8 L 44 12 M 7 30 L 10 32 L 12 29 L 15 33 L 17 31 M 47 25 L 50 28 L 53 25 L 57 28 M 43 49 L 45 52 L 44 55" />
        </g>
      </g>
    </svg>
  )
}
