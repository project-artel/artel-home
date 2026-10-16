/**
 * 비어 있는 자리의 그림(ARTEL-1100). 옅은 회색 선으로 손그림처럼 — 반듯한 사각형 대신 살짝 비뚤어진
 * 선, 끝이 맞물리지 않는 링, 점선. 무엇이 여기 쌓일지를 보이되, 진짜 데이터처럼 읽히지 않게 색을 뺐다.
 *
 * 판마다 뒤에 같은 모양을 비스듬히 한 겹 더 그리고 모서리를 사선으로 이어 두께를 준다 — 종이 위의
 * 손그림이 아니라 떠 있는 판처럼 보이게. 장식이라 `aria-hidden` 이고, 옆의 문구가 같은 것을 말한다.
 */

const CARD = 'M20 30 Q18 21 28 21 L290 19 Q301 20 301 30 L302 142 Q301 152 291 152 L29 154 Q19 153 19 143 Z'
const TILE = 'M2 4 Q1 0 6 0 L44 1 Q49 1 49 6 L48 76 Q48 81 43 81 L6 80 Q1 80 1 75 Z'

/** 실행 기록이 없을 때: 두께가 있는 카드 하나에 타일 넷, 최신이 왼쪽. */
export function BoardSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 190">
      {/* 두께: 뒤 판과 모서리 사선 */}
      <path className="qh-sketch-depth" d={CARD} transform="translate(10 12)" />
      <path className="qh-sketch-edge" d="M301 30 L311 42 M302 142 L312 154 M19 143 L29 155" />

      <path className="qh-sketch-face" d={CARD} />
      {[0, 1, 2, 3].map((index) => (
        <g key={`depth-${index}`} transform={`translate(${54 + index * 60 + 4} 60)`}>
          <path className="qh-sketch-depth" d={TILE} />
        </g>
      ))}
      <path d="M38 40 Q90 38 146 40" />
      <path className="qh-sketch-dash" d="M160 40 L204 40" />
      <path d="M252 37 q6 -1 12 1" />
      <path className="qh-sketch-soft" d="M44 98 l-10 0 m4 -4 l-4 4 l4 4" />
      {[0, 1, 2, 3].map((index) => {
        const x = 54 + index * 60
        return (
          <g key={index} transform={`translate(${x} 56)`}>
            <path className="qh-sketch-face" d={TILE} />
            <path className="qh-sketch-edge" d="M49 6 L53 10 M48 76 L52 80 M6 80 L10 84" />
            <path className="qh-sketch-soft" d="M15 11 L35 11" />
            <circle cx="25" cy="38" r="13" strokeDasharray={['64 18', '50 32', '42 40', '22 60'][index]} transform="rotate(-80 25 38)" />
            <path className="qh-sketch-soft" d="M14 62 Q25 61 36 62" />
            <path className="qh-sketch-dash" d="M12 70 L38 70" />
          </g>
        )
      })}
      <path className="qh-sketch-soft" d="M284 6 l0 10 M279 11 l10 0" />
      <ellipse className="qh-sketch-shade" cx="166" cy="176" rx="132" ry="6" />
    </svg>
  )
}

const PICK_TILE = 'M24 30 Q23 25 28 25 L80 26 Q85 26 85 31 L84 112 Q84 117 79 117 L29 116 Q24 116 24 111 Z'
const PICK_PANEL = 'M140 36 Q139 30 145 30 L196 31 Q201 31 201 36 L200 128 Q200 134 195 134 L146 133 Q140 133 140 128 Z'

/** 실행을 고르기 전 오른쪽 칸: 타일 하나를 가리키는 커서, 그 옆으로 펼쳐질 상세 판. */
export function PickSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 220 176">
      <path className="qh-sketch-depth" d={PICK_TILE} transform="translate(6 8)" />
      <path className="qh-sketch-edge" d="M85 31 L91 39 M84 112 L90 120 M24 111 L30 119" />
      <path className="qh-sketch-depth" d={PICK_PANEL} transform="translate(6 8)" />
      <path className="qh-sketch-edge" d="M201 36 L207 44 M200 128 L206 136 M140 128 L146 136" />

      <path className="qh-sketch-face" d={PICK_TILE} />
      <path className="qh-sketch-soft" d="M40 37 L68 37" />
      <circle cx="54" cy="66" r="15" strokeDasharray="70 25" transform="rotate(-80 54 66)" />
      <path className="qh-sketch-soft" d="M40 94 Q54 93 68 94" />
      <path className="qh-sketch-dash" d="M38 103 L70 103" />
      <path className="qh-sketch-face" d="M70 104 l14 32 l5 -12 l13 -4 Z" />
      <path className="qh-sketch-soft" d="M90 128 l12 12" />
      <path className="qh-sketch-dash" d="M104 44 Q118 42 132 46" />
      <path className="qh-sketch-face" d={PICK_PANEL} />
      <path className="qh-sketch-soft" d="M152 46 L186 46" />
      <path className="qh-sketch-dash" d="M152 60 L190 60" />
      <path className="qh-sketch-dash" d="M152 72 L178 72" />
      <path className="qh-sketch-soft" d="M152 90 L162 90 M152 100 L176 100 M152 110 L168 110" />
      <path className="qh-sketch-soft" d="M200 12 l0 9 M195.5 16.5 l9 0" />
      <ellipse className="qh-sketch-shade" cx="114" cy="160" rx="92" ry="5" />
    </svg>
  )
}
