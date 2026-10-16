/**
 * 스튜디오의 빈 자리 그림(ARTEL-1107). QA 히스토리의 빈 자리(`HistorySketch`)와 같은 말투다 — 옅은 회색
 * 손그림 선, 판마다 뒤에 한 겹 더 그리고 모서리를 사선으로 이어 떠 있는 두께를 준다. 진짜 데이터처럼
 * 읽히지 않게 색을 뺐다. 장식이라 `aria-hidden` 이고, 옆의 문구가 같은 것을 말한다.
 */

const AGENT_BUBBLE = 'M20 24 Q19 16 28 16 L150 15 Q160 16 160 25 L161 74 Q160 83 151 83 L52 84 L36 98 L38 84 L29 84 Q20 83 20 74 Z'
const USER_BUBBLE = 'M120 104 Q119 96 128 96 L228 95 Q237 96 237 104 L238 134 Q237 142 228 142 L222 142 L224 156 L208 142 L129 143 Q120 142 120 134 Z'

/** 대화가 없을 때: 에이전트 말풍선과 사람 말풍선, 그 사이의 별. */
export function ChatSketch() {
  return (
    <svg aria-hidden="true" className="st-sketch" fill="none" viewBox="0 0 260 172">
      <path className="st-sketch-depth" d={AGENT_BUBBLE} transform="translate(8 10)" />
      <path className="st-sketch-edge" d="M160 25 L168 35 M161 74 L169 84 M20 74 L28 84" />
      <path className="st-sketch-depth" d={USER_BUBBLE} transform="translate(8 10)" />
      <path className="st-sketch-edge" d="M237 104 L245 114 M238 134 L246 144 M120 134 L128 144" />

      <path className="st-sketch-face" d={AGENT_BUBBLE} />
      <path className="st-sketch-soft" d="M36 34 L118 33" />
      <path d="M36 49 Q90 48 142 50" />
      <path className="st-sketch-dash" d="M36 64 L106 64" />
      <path className="st-sketch-face" d="M184 10 q2 8 8 10 q-6 2 -8 10 q-2 -8 -8 -10 q6 -2 8 -10 Z" />
      <path className="st-sketch-soft" d="M202 34 l0 7 M198.5 37.5 l7 0" />

      <path className="st-sketch-face" d={USER_BUBBLE} />
      <path className="st-sketch-soft" d="M136 112 L212 111" />
      <path className="st-sketch-dash" d="M136 126 L190 126" />
      <ellipse className="st-sketch-shade" cx="132" cy="165" rx="112" ry="5" />
    </svg>
  )
}

const SHEET = 'M30 22 Q29 14 38 14 L252 13 Q261 14 261 23 L262 160 Q261 168 252 168 L39 169 Q30 168 30 160 Z'

function chip(y: number) {
  return `M210 ${y - 7} L240 ${y - 7} Q244 ${y - 7} 244 ${y - 3} L244 ${y + 4} Q244 ${y + 8} 240 ${y + 8} L210 ${y + 8} Q206 ${y + 8} 206 ${y + 4} L206 ${y - 3} Q206 ${y - 7} 210 ${y - 7} Z`
}

/** 런에 시나리오가 없을 때: 단계 셋이 이어진 시나리오 한 장. 마지막 줄은 아직 비어 있다. */
export function ScenarioSketch() {
  const rows = [56, 92, 128]
  return (
    <svg aria-hidden="true" className="st-sketch" fill="none" viewBox="0 0 300 200">
      <path className="st-sketch-depth" d={SHEET} transform="translate(10 12)" />
      <path className="st-sketch-edge" d="M261 23 L271 35 M262 160 L272 172 M30 160 L40 172" />

      <path className="st-sketch-face" d={SHEET} />
      <path d="M48 32 Q100 30 150 32" />
      <path className="st-sketch-dash" d="M164 32 L200 32" />
      {rows.map((y, index) => (
        <g key={y}>
          <circle cx="58" cy={y} r="8" strokeDasharray={index === 2 ? '4 4' : undefined} />
          {index < 2 && <path className="st-sketch-dash" d={`M58 ${y + 10} L58 ${y + 26}`} />}
          <path className={index === 2 ? 'st-sketch-dash' : index === 0 ? undefined : 'st-sketch-soft'} d={`M76 ${y} Q136 ${y - 1} ${index === 2 ? 150 : 192} ${y}`} />
          {index < 2 && <path className="st-sketch-face" d={chip(y)} />}
        </g>
      ))}
      <path className="st-sketch-soft" d="M280 4 l0 10 M275 9 l10 0" />
      <ellipse className="st-sketch-shade" cx="152" cy="190" rx="122" ry="5" />
    </svg>
  )
}
