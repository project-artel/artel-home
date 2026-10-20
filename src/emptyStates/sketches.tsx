/**
 * 빈 화면 · 없는 주소의 그림(ARTEL-1162). QA 히스토리의 `BoardSketch` 와 같은 손그림이다 — 옅은 회색 선,
 * 살짝 비뚤어진 판, 뒤에 한 겹 더 그린 판과 모서리 사선으로 두께, 바닥 그림자. 장식이라 `aria-hidden` 이고
 * 옆의 문구가 같은 것을 말한다. 선 색 · 두께는 `.qh-sketch` 규칙이 정한다.
 */

const RUN_CARD = 'M22 26 Q20 17 30 17 L262 15 Q273 16 273 26 L274 150 Q273 160 263 160 L31 162 Q21 161 21 151 Z'

/** 테스트 런이 없을 때: 시나리오 줄이 담길 런 카드 하나와 그 옆의 실행 단추. */
export function TestRunSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d={RUN_CARD} transform="translate(10 12)" />
      <path className="qh-sketch-edge" d="M273 26 L283 38 M274 150 L284 162 M21 151 L31 163" />
      <path className="qh-sketch-face" d={RUN_CARD} />
      {/* 런 이름과 버전 */}
      <path d="M40 38 Q92 36 150 38" />
      <path className="qh-sketch-dash" d="M164 38 L206 38" />
      {/* 시나리오 줄 셋, 마지막은 아직 빈 자리 */}
      {[0, 1, 2].map((index) => {
        const y = 64 + index * 28
        return (
          <g key={index}>
            <circle cx="48" cy={y} r="6" strokeDasharray={index === 2 ? '3 4' : undefined} />
            <path className={index === 2 ? 'qh-sketch-dash' : 'qh-sketch-soft'} d={`M64 ${y} Q120 ${y - 1} ${index === 1 ? 186 : 210} ${y}`} />
          </g>
        )
      })}
      <path className="qh-sketch-soft" d="M42 140 l8 0 m-4 -4 l0 8" />
      {/* 실행 단추: 두께 있는 원과 삼각형 */}
      <circle className="qh-sketch-depth" cx="292" cy="118" r="22" />
      <circle className="qh-sketch-face" cx="288" cy="112" r="22" />
      <path d="M282 102 L299 112 L282 122 Z" />
      <path className="qh-sketch-dash" d="M262 84 Q276 90 282 96" />
      <path className="qh-sketch-soft" d="M304 22 l0 10 M299 27 l10 0" />
      <ellipse className="qh-sketch-shade" cx="160" cy="182" rx="134" ry="6" />
    </svg>
  )
}

const MACRO_CARD = 'M2 6 Q1 0 8 0 L150 1 Q157 1 157 8 L156 92 Q156 99 149 99 L8 98 Q1 98 1 91 Z'

/** macro 가 없을 때: 겹쳐 놓인 macro 카드 둘 — 앞 카드에 함수 이름과 인자 자리. */
export function MacroSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      {/* 뒤 카드 */}
      <g transform="translate(140 22)">
        <path className="qh-sketch-depth" d={MACRO_CARD} transform="translate(8 10)" />
        <path className="qh-sketch-face" d={MACRO_CARD} />
        <path className="qh-sketch-soft" d="M18 22 L82 22" />
        <path className="qh-sketch-dash" d="M18 40 L120 40" />
      </g>
      {/* 앞 카드 */}
      <g transform="translate(46 58)">
        <path className="qh-sketch-depth" d={MACRO_CARD} transform="translate(10 12)" />
        <path className="qh-sketch-edge" d="M157 8 L167 20 M156 92 L166 104 M1 91 L11 103" />
        <path className="qh-sketch-face" d={MACRO_CARD} />
        {/* ƒ( ) 와 인자 줄 */}
        <path d="M24 30 q-1 -12 9 -11 M20 40 l14 0 M27 24 q-2 22 -6 28 q-3 4 -7 2" />
        <path d="M48 22 q-6 10 0 22 M96 22 q6 10 0 22" />
        <path className="qh-sketch-soft" d="M56 33 L66 33 M74 33 L86 33" />
        <path className="qh-sketch-dash" d="M20 66 L130 66" />
        <path className="qh-sketch-dash" d="M20 78 L104 78" />
      </g>
      <path className="qh-sketch-soft" d="M300 160 l0 10 M295 165 l10 0" />
      <path className="qh-sketch-soft" d="M28 34 l0 8 M24 38 l8 0" />
      <ellipse className="qh-sketch-shade" cx="160" cy="184" rx="128" ry="6" />
    </svg>
  )
}
