/**
 * 이슈 화면의 빈 자리 그림(ARTEL-1114). 시나리오 편집기 · QA 히스토리의 빈 자리 그림과 같은 말투다 — 옅은 회색
 * 손그림 선, 판마다 뒤에 한 겹 더 그리고 모서리를 사선으로 이어 떠 있는 두께를 준다. 진짜 데이터처럼 읽히지 않게
 * 색을 뺐다. 장식이라 `aria-hidden` 이고, 옆의 문구가 같은 것을 말한다.
 */

const REPORT = 'M40 20 Q39 12 48 12 L196 11 Q205 12 205 21 L206 150 Q205 158 196 158 L49 159 Q40 158 40 150 Z'

/** 조건에 맞는 이슈가 없을 때: 결함 보고서 한 장 위에 돋보기. 돋보기 안은 비어 있다. */
export function IssuesSketch() {
  return (
    <svg aria-hidden="true" className="dc-sketch" fill="none" viewBox="0 0 280 190">
      <path className="dc-sketch-depth" d={REPORT} transform="translate(9 11)" />
      <path className="dc-sketch-edge" d="M205 21 L214 32 M206 150 L215 161 M40 150 L49 161" />

      <path className="dc-sketch-face" d={REPORT} />
      <path d="M58 32 L96 31 Q100 31 100 35 L100 42 Q100 46 96 46 L58 46 Q54 46 54 42 L54 35 Q54 31 58 32 Z" />
      <path d="M112 39 Q150 38 186 40" />
      <path className="dc-sketch-soft" d="M58 66 Q120 65 186 67" />
      <path className="dc-sketch-soft" d="M58 82 Q110 81 160 83" />
      <path className="dc-sketch-dash" d="M58 104 L150 104" />
      <path className="dc-sketch-dash" d="M58 120 L128 120" />
      <path className="dc-sketch-soft" d="M58 138 l6 0 M70 138 l40 0" />

      <circle className="dc-sketch-depth" cx="214" cy="112" r="36" transform="translate(6 7)" />
      <circle className="dc-sketch-face" cx="214" cy="112" r="36" />
      <circle className="dc-sketch-soft" cx="214" cy="112" r="27" />
      <path className="dc-sketch-dash" d="M200 106 Q206 98 216 98" />
      <path d="M240 138 L262 162 Q265 166 261 169 Q257 172 254 168 L233 144" />
      <path className="dc-sketch-soft" d="M30 8 l0 9 M25.5 12.5 l9 0" />
      <ellipse className="dc-sketch-shade" cx="150" cy="182" rx="118" ry="5" />
    </svg>
  )
}

const CARD = (x: number, y: number) =>
  `M${x} ${y + 8} Q${x - 1} ${y} ${x + 8} ${y} L${x + 150} ${y - 1} Q${x + 159} ${y} ${x + 159} ${y + 9} L${x + 160} ${y + 52} Q${x + 159} ${y + 60} ${x + 150} ${y + 60} L${x + 9} ${y + 61} Q${x} ${y + 60} ${x} ${y + 52} Z`
const BUBBLE = 'M196 20 Q195 12 204 12 L262 11 Q271 12 271 21 L272 50 Q271 58 262 58 L232 58 L220 70 L222 58 L205 58 Q196 58 196 50 Z'

/** 팀 공유 글이 없을 때: 아직 빈 글 카드 두 장이 겹쳐 있고, 옆에 말을 기다리는 말풍선. */
export function BoardSketch() {
  return (
    <svg aria-hidden="true" className="dc-sketch" fill="none" viewBox="0 0 290 200">
      <path className="dc-sketch-depth" d={CARD(46, 108)} transform="translate(8 9)" />
      <path className="dc-sketch-face" d={CARD(46, 108)} />
      <path className="dc-sketch-soft" d="M64 126 L104 125" />
      <path className="dc-sketch-dash" d="M64 142 L170 142" />
      <path className="dc-sketch-dash" d="M64 156 L140 156" />

      <path className="dc-sketch-depth" d={CARD(24, 52)} transform="translate(8 9)" />
      <path className="dc-sketch-edge" d="M183 61 L191 70 M184 104 L192 113 M24 104 L32 113" />
      <path className="dc-sketch-face" d={CARD(24, 52)} />
      <path d="M42 70 L72 69 Q76 69 76 73 L76 79 Q76 83 72 83 L42 83 Q38 83 38 79 L38 73 Q38 69 42 70 Z" />
      <path d="M42 92 Q100 91 160 93" />
      <circle className="dc-sketch-soft" cx="46" cy="104" r="4" />
      <path className="dc-sketch-dash" d="M56 104 L110 104" />

      <path className="dc-sketch-depth" d={BUBBLE} transform="translate(7 8)" />
      <path className="dc-sketch-edge" d="M271 21 L278 29 M272 50 L279 58" />
      <path className="dc-sketch-face" d={BUBBLE} />
      <circle cx="218" cy="35" r="2.5" />
      <circle className="dc-sketch-soft" cx="233" cy="35" r="2.5" />
      <circle className="dc-sketch-dash" cx="248" cy="35" r="2.5" />
      <path className="dc-sketch-soft" d="M18 18 l0 9 M13.5 22.5 l9 0" />
      <ellipse className="dc-sketch-shade" cx="150" cy="192" rx="124" ry="5" />
    </svg>
  )
}

/** 글에 댓글이 없을 때: 작은 말풍선 하나와 입력을 기다리는 줄. */
export function CommentsSketch() {
  const bubble = 'M30 18 Q29 10 38 10 L150 9 Q159 10 159 19 L160 52 Q159 60 150 60 L64 60 L48 74 L50 60 L39 60 Q30 60 30 52 Z'
  return (
    <svg aria-hidden="true" className="dc-sketch dc-sketch--small" fill="none" viewBox="0 0 190 90">
      <path className="dc-sketch-depth" d={bubble} transform="translate(6 7)" />
      <path className="dc-sketch-edge" d="M159 19 L165 26 M160 52 L166 59" />
      <path className="dc-sketch-face" d={bubble} />
      <path className="dc-sketch-soft" d="M46 28 L120 27" />
      <path className="dc-sketch-dash" d="M46 42 L100 42" />
      <ellipse className="dc-sketch-shade" cx="98" cy="84" rx="78" ry="4" />
    </svg>
  )
}
