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

/* ── 화면 지도의 빈 상태(ARTEL-1172) ─────────────────────────────────────── */

const BOX_TOP = 'M80 58 L170 30 L262 58 L172 86 Z'

/** 등록된 빌드가 없을 때: 버전 꼬리표가 달린 빈 빌드 상자. */
export function BuildSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      {/* 상자 옆면 둘과 윗면 */}
      <path className="qh-sketch-depth" d="M80 58 L172 86 L172 168 L82 140 Z" />
      <path className="qh-sketch-face" d="M172 86 L262 58 L262 140 L172 168 Z" />
      <path className="qh-sketch-face" d={BOX_TOP} />
      {/* 열린 뚜껑 날개 */}
      <path className="qh-sketch-soft" d="M80 58 L58 34 L148 8 L170 30" />
      <path className="qh-sketch-dash" d="M262 58 L288 36 L196 10" />
      {/* 꼬리표 */}
      <path d="M198 108 L238 96 L246 104 L246 122 L206 134 L198 126 Z" />
      <circle cx="205" cy="117" r="2.5" />
      <path className="qh-sketch-soft" d="M214 118 L236 111 M214 126 L230 121" />
      <path className="qh-sketch-dash" d="M172 98 L172 160" />
      <path className="qh-sketch-soft" d="M42 128 l0 10 M37 133 l10 0 M296 150 l0 8 M292 154 l8 0" />
      <ellipse className="qh-sketch-shade" cx="172" cy="178" rx="112" ry="6" />
    </svg>
  )
}

const SCREEN_FRAME = 'M40 24 Q38 16 47 16 L238 14 Q247 14 247 23 L248 132 Q248 140 239 140 L48 141 Q40 141 40 133 Z'

/** 한 번도 스캔하지 않았을 때: 게임 화면 위를 훑는 돋보기. */
export function ScanSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d={SCREEN_FRAME} transform="translate(9 11)" />
      <path className="qh-sketch-edge" d="M247 23 L256 34 M248 132 L257 143 M40 133 L49 144" />
      <path className="qh-sketch-face" d={SCREEN_FRAME} />
      {/* 화면 안: 언덕과 해, 단추 둘 */}
      <path className="qh-sketch-soft" d="M52 118 Q96 86 132 112 Q170 82 236 116" />
      <circle className="qh-sketch-soft" cx="206" cy="46" r="10" />
      <path d="M66 40 Q96 38 128 40" />
      <path className="qh-sketch-dash" d="M66 56 L112 56" />
      {/* 훑는 선 */}
      <path className="qh-sketch-dash" d="M52 78 L236 76" />
      {/* 돋보기 */}
      <circle className="qh-sketch-depth" cx="244" cy="118" r="30" />
      <circle className="qh-sketch-face" cx="240" cy="112" r="30" />
      <circle className="qh-sketch-soft" cx="240" cy="112" r="20" />
      <path d="M262 134 L292 164" />
      <path className="qh-sketch-soft" d="M296 28 l0 10 M291 33 l10 0" />
      <ellipse className="qh-sketch-shade" cx="160" cy="182" rx="130" ry="6" />
    </svg>
  )
}

const SHEET = 'M0 6 Q0 0 6 0 L92 0 L120 26 L120 132 Q120 138 114 138 L6 138 Q0 138 0 132 Z'

/** 올라온 문서가 없을 때: 접힌 귀퉁이만 있는 빈 문서 한 장. */
export function DocumentSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <g transform="translate(104 22)">
        <path className="qh-sketch-depth" d={SHEET} transform="translate(10 11)" />
        <path className="qh-sketch-face" d={SHEET} />
        <path d="M92 0 L92 26 L120 26" />
        <path className="qh-sketch-dash" d="M18 46 L96 46 M18 64 L84 64 M18 82 L100 82 M18 100 L66 100" />
      </g>
      {/* 올라오는 화살표 자리 — 아직 아무것도 안 왔다 */}
      <path className="qh-sketch-dash" d="M268 150 L268 74 M256 88 L268 74 L280 88" />
      <path className="qh-sketch-soft" d="M52 52 l0 10 M47 57 l10 0" />
      <ellipse className="qh-sketch-shade" cx="168" cy="182" rx="100" ry="6" />
    </svg>
  )
}

/** 문서는 왔는데 아직 안 읽혔을 때: 쌓인 문서와 모래시계. */
export function IngestSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      {[2, 1, 0].map((layer) => (
        <g key={layer} transform={`translate(${70 + layer * 16} ${18 + layer * 10})`}>
          <path className={layer === 0 ? 'qh-sketch-face' : 'qh-sketch-depth'} d={SHEET} />
          {layer === 0 && <path d="M92 0 L92 26 L120 26" />}
          {layer === 0 && <path className="qh-sketch-soft" d="M18 46 L96 46 M18 64 L84 64 M18 82 L100 82" />}
        </g>
      ))}
      {/* 모래시계 */}
      <g transform="translate(238 70)">
        <path className="qh-sketch-face" d="M0 0 L44 0 L24 40 L44 80 L0 80 L20 40 Z" />
        <path d="M-4 0 L48 0 M-4 80 L48 80" />
        <path className="qh-sketch-soft" d="M8 72 Q22 60 36 72" />
        <path className="qh-sketch-dash" d="M22 44 L22 64" />
      </g>
      <ellipse className="qh-sketch-shade" cx="170" cy="182" rx="128" ry="6" />
    </svg>
  )
}

const BOARD = 'M30 24 Q28 15 38 15 L286 13 Q296 14 296 24 L297 146 Q296 155 286 155 L39 157 Q29 156 29 146 Z'

/** 읽었는데 씬이 없을 때: 점선 씬 자리만 있는 지도 판. [broken] 이면 잇는 선이 끊겨 있다(불러오기 실패). */
export function SceneMapSketch({ broken = false }: { broken?: boolean }) {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d={BOARD} transform="translate(9 11)" />
      <path className="qh-sketch-edge" d="M296 24 L305 35 M297 146 L306 157 M29 146 L38 157" />
      <path className="qh-sketch-face" d={BOARD} />
      {/* 씬 카드 자리 셋 */}
      {[
        [52, 46],
        [138, 30],
        [214, 86],
      ].map(([x, y], index) => (
        <g key={index}>
          <rect height="42" rx="6" strokeDasharray="4 4" width="64" x={x} y={y} />
          <rect className="qh-sketch-soft" height="18" rx="3" width="22" x={x + 7} y={y + 8} />
          <path className="qh-sketch-soft" d={`M${x + 36} ${y + 13} L${x + 56} ${y + 13} M${x + 36} ${y + 23} L${x + 50} ${y + 23}`} />
        </g>
      ))}
      {/* 잇는 선 */}
      {broken ? (
        <>
          {/* 판을 가로지르는 금과, 끊겨 두 토막이 난 잇는 선 */}
          <path d="M170 14 L160 48 L176 70 L162 102 L178 130 L168 156" />
          <path className="qh-sketch-soft" d="M116 66 Q124 58 132 55" />
          <circle cx="134" cy="54" r="2.5" />
          <circle cx="146" cy="58" r="2.5" />
          <path className="qh-sketch-soft" d="M202 58 Q212 70 218 82" />
          <path className="qh-sketch-soft" d="M140 40 l-6 -6 M148 42 l4 -8 M152 50 l8 -2" />
        </>
      ) : (
        <path className="qh-sketch-dash" d="M116 66 Q128 50 138 50 M202 54 Q218 66 224 86" />
      )}
      <path className="qh-sketch-soft" d="M60 124 Q120 118 176 126" />
      <path className="qh-sketch-soft" d="M312 20 l0 10 M307 25 l10 0" />
      <ellipse className="qh-sketch-shade" cx="166" cy="182" rx="136" ry="6" />
    </svg>
  )
}

const CHART_BOARD = 'M30 22 Q28 13 38 13 L236 11 Q246 11 246 21 L247 136 Q247 145 237 145 L39 146 Q30 146 30 137 Z'

/** 성능 런이 없을 때(ARTEL-1207): 비어 있는 추세판과 그 앞에 놓인 스톱워치. 점선 추세에 아직 점 하나만 비어 있다. */
export function PerformanceSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      {/* 추세판 */}
      <path className="qh-sketch-depth" d={CHART_BOARD} transform="translate(10 12)" />
      <path className="qh-sketch-edge" d="M246 21 L256 33 M247 136 L257 148 M30 137 L40 149" />
      <path className="qh-sketch-face" d={CHART_BOARD} />
      {/* 축과 눈금 */}
      <path d="M52 32 L52 124 Q140 125 228 123" />
      <path className="qh-sketch-soft" d="M47 56 l5 0 M47 80 l5 0 M47 104 l5 0" />
      <path className="qh-sketch-dash" d="M58 56 L226 55 M58 80 L226 79" />
      {/* 아직 그려지지 않은 추세: 점선과 빈 점 */}
      <path className="qh-sketch-dash" d="M66 108 Q96 96 112 100 Q140 108 160 86 Q178 70 206 74" />
      <circle className="qh-sketch-face" cx="66" cy="108" r="4.5" />
      <circle className="qh-sketch-face" cx="112" cy="100" r="4.5" />
      <circle className="qh-sketch-face" cx="160" cy="86" r="4.5" strokeDasharray="3 3" />
      <circle className="qh-sketch-face" cx="206" cy="74" r="4.5" strokeDasharray="3 3" />
      {/* 스톱워치 */}
      <circle className="qh-sketch-depth" cx="262" cy="128" r="30" />
      <circle className="qh-sketch-face" cx="257" cy="122" r="30" />
      <circle className="qh-sketch-soft" cx="257" cy="122" r="22" />
      <path d="M257 122 L257 106 M257 122 L268 129" />
      <path d="M251 86 L263 86 M257 86 L257 92" />
      <path className="qh-sketch-soft" d="M280 98 l6 -6" />
      <path className="qh-sketch-soft" d="M300 30 l0 10 M295 35 l10 0 M18 164 l0 8 M14 168 l8 0" />
      <ellipse className="qh-sketch-shade" cx="160" cy="182" rx="134" ry="6" />
    </svg>
  )
}

const FOLDER_BACK = 'M62 46 Q60 38 69 38 L128 37 L144 54 L262 53 Q271 53 271 62 L272 150 Q272 158 263 158 L70 160 Q62 160 62 152 Z'
const FOLDER_FRONT = 'M58 76 Q57 68 66 68 L266 66 Q275 66 274 75 L268 152 Q267 160 258 160 L70 162 Q61 162 61 154 Z'

/** 폴더가 하나도 없을 때(ARTEL-1378): 비어 있는 폴더 하나와 그 위에 떠 있는 + 표. 앞판을 덮어 두께를 낸다. */
export function FolderSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d={FOLDER_BACK} transform="translate(8 8)" />
      <path className="qh-sketch-face" d={FOLDER_BACK} />
      <path className="qh-sketch-face" d={FOLDER_FRONT} />
      <path className="qh-sketch-edge" d="M274 75 L282 84 M268 152 L276 161 M61 154 L69 163" />
      <path className="qh-sketch-dash" d="M96 100 Q160 98 230 100" />
      <path className="qh-sketch-soft" d="M96 124 Q140 122 186 124" />
      <circle className="qh-sketch-depth" cx="252" cy="34" r="16" />
      <circle className="qh-sketch-face" cx="248" cy="30" r="16" />
      <path d="M248 22 L248 38 M240 30 L256 30" />
      <path className="qh-sketch-soft" d="M40 40 l0 10 M35 45 l10 0 M300 120 l0 8 M296 124 l8 0" />
      <ellipse className="qh-sketch-shade" cx="168" cy="180" rx="118" ry="6" />
    </svg>
  )
}

const CALENDAR = 'M98 22 Q96 14 105 14 L227 13 Q235 13 235 21 L236 110 Q236 118 228 118 L106 119 Q98 119 98 111 Z'
const PERSON = 'M-18 50 Q-16 22 0 20 Q16 22 18 50 Z'

/**
 * 대시보드 이번 빌드 검증 진행이 빌 때(ARTEL-1387): 벽에 걸린 큰 달력과, 그 아래에서 달력을 올려다보며 고민하는
 * 두 사람 — 한 사람은 턱을 괴고, 한 사람은 동그라미 친 날을 가리킨다.
 */
export function CalendarSketch() {
  const columns = [1, 2, 3, 4, 5, 6].map((step) => 98 + step * 19.7)
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      {/* 달력 판과 두께 */}
      <path className="qh-sketch-depth" d={CALENDAR} transform="translate(9 10)" />
      <path className="qh-sketch-edge" d="M235 21 L244 32 M236 110 L245 121 M98 111 L107 122" />
      <path className="qh-sketch-face" d={CALENDAR} />
      {/* 고리 둘과 머리 띠 */}
      <path d="M132 6 Q128 6 128 12 L128 20 M202 6 Q198 6 198 12 L198 20" />
      <path d="M99 36 Q166 35 235 35" />
      <path className="qh-sketch-soft" d="M150 26 Q166 25 182 26" />
      {/* 칸 */}
      <path className="qh-sketch-soft" d={`${columns.map((x) => `M${x} 40 L${x} 114`).join(' ')} M100 58 L234 58 M100 77 L234 77 M100 96 L234 96`} />
      {/* 지난 날은 사선, 고민하는 날은 점선 동그라미 */}
      <path className="qh-sketch-soft" d="M102 54 l12 -11 M122 54 l12 -11 M141 54 l12 -11 M161 54 l12 -11 M102 73 l12 -11 M122 73 l12 -11" />
      <ellipse className="qh-sketch-dash" cx="190" cy="86" rx="13" ry="10" />
      <path d="M209 105 l4 4 l7 -8" />
      {/* 왼쪽 사람: 턱을 괴고 올려다본다 */}
      <g transform="translate(58 122) scale(1.15)">
        <circle className="qh-sketch-depth" cx="4" cy="4" r="11" />
        <path className="qh-sketch-depth" d={PERSON} transform="translate(4 4)" />
        <path className="qh-sketch-face" d={PERSON} />
        <circle className="qh-sketch-face" cx="0" cy="0" r="11" />
        <path className="qh-sketch-soft" d="M2 -3 l0 1 M7 -4 l0 1" />
        <path d="M11 44 Q22 30 10 13" />
        <circle className="qh-sketch-face" cx="9" cy="11" r="3.2" />
      </g>
      {/* 생각: 물음표와 거품 */}
      <path d="M80 86 Q80 78 88 78 Q96 78 96 85 Q96 91 88 93 L88 97" />
      <circle cx="88" cy="103" r="1.2" />
      <circle className="qh-sketch-soft" cx="78" cy="112" r="2" />
      {/* 오른쪽 사람: 동그라미 친 날을 가리킨다 */}
      <g transform="translate(274 120) scale(1.15)">
        <circle className="qh-sketch-depth" cx="4" cy="4" r="11" />
        <path className="qh-sketch-depth" d={PERSON} transform="translate(4 4)" />
        <path className="qh-sketch-face" d={PERSON} />
        <circle className="qh-sketch-face" cx="0" cy="0" r="11" />
        <path className="qh-sketch-soft" d="M-7 -4 l0 1 M-2 -3 l0 1" />
        <path d="M-12 30 Q-26 20 -32 4" />
        <circle className="qh-sketch-face" cx="-33" cy="2" r="3.2" />
      </g>
      <path className="qh-sketch-soft" d="M34 40 l0 10 M29 45 l10 0 M304 30 l0 8 M300 34 l8 0" />
      <ellipse className="qh-sketch-shade" cx="166" cy="182" rx="138" ry="6" />
    </svg>
  )
}
