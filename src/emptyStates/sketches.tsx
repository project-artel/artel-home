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

const CARD = 'M30 30 Q28 21 38 21 L192 19 Q202 19 202 29 L203 150 Q203 159 193 159 L39 161 Q29 161 29 151 Z'
const SIDE_BOX = 'M226 56 Q224 48 233 48 L300 47 Q308 47 308 55 L309 120 Q309 128 300 128 L234 129 Q226 129 226 121 Z'

/** 이슈 트래커 탭(ARTEL-1380): 이슈 카드 하나가 점선을 따라 저장소 상자로 건너간다. */
export function TrackerSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d={CARD} transform="translate(9 10)" />
      <path className="qh-sketch-edge" d="M202 29 L211 39 M203 150 L212 160 M29 151 L38 161" />
      <path className="qh-sketch-face" d={CARD} />
      <circle cx="52" cy="46" r="7" />
      <path d="M68 46 Q108 44 150 46" />
      <path className="qh-sketch-soft" d="M48 74 Q110 72 178 74 M48 94 Q100 92 160 94 M48 114 Q96 112 132 114" />
      <path className="qh-sketch-dash" d="M48 138 L96 138" />
      <path className="qh-sketch-depth" d={SIDE_BOX} transform="translate(7 8)" />
      <path className="qh-sketch-face" d={SIDE_BOX} />
      <path d="M248 74 L262 66 L276 74 L276 92 L262 100 L248 92 Z" />
      <path className="qh-sketch-soft" d="M262 66 L262 100 M248 74 L276 92" />
      <path className="qh-sketch-dash" d="M204 88 Q214 70 226 76" />
      <path className="qh-sketch-soft" d="M290 22 l0 10 M285 27 l10 0" />
      <ellipse className="qh-sketch-shade" cx="168" cy="182" rx="134" ry="6" />
    </svg>
  )
}

/** 검토 탭(ARTEL-1380): 체크 줄 셋이 있는 검토 카드와 그 위에 찍힌 승인 도장. 마지막 줄은 아직 빈 자리다. */
export function ReviewSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d={CARD} transform="translate(59 10)" />
      <path className="qh-sketch-face" d={CARD} transform="translate(50 0)" />
      {[0, 1, 2].map((index) => {
        const y = 56 + index * 32
        return (
          <g key={index}>
            <path className={index === 2 ? 'qh-sketch-dash' : undefined} d={`M98 ${y - 8} h16 v16 h-16 Z`} />
            {index < 2 && <path d={`M101 ${y} l4 4 l7 -8`} />}
            <path className={index === 2 ? 'qh-sketch-dash' : 'qh-sketch-soft'} d={`M126 ${y} Q170 ${y - 1} ${index === 1 ? 200 : 222} ${y}`} />
          </g>
        )
      })}
      <circle className="qh-sketch-depth" cx="252" cy="140" r="24" />
      <circle className="qh-sketch-face" cx="248" cy="134" r="24" />
      <circle className="qh-sketch-soft" cx="248" cy="134" r="16" />
      <path d="M238 134 l7 7 l13 -14" />
      <path className="qh-sketch-soft" d="M40 40 l0 10 M35 45 l10 0" />
      <ellipse className="qh-sketch-shade" cx="168" cy="182" rx="124" ry="6" />
    </svg>
  )
}

/** 프로젝트 agent 모델 탭(ARTEL-1380): 반짝이가 박힌 모델 칩 하나와 거기서 나가는 대화 말풍선. */
export function ModelChipSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d="M100 52 L190 52 L190 142 L100 142 Z" transform="translate(9 9)" />
      <path className="qh-sketch-face" d="M100 52 Q99 44 108 44 L182 44 Q191 44 191 53 L191 134 Q191 143 182 143 L108 143 Q100 143 100 134 Z" />
      <path className="qh-sketch-soft" d="M112 30 v14 M132 30 v14 M152 30 v14 M172 30 v14 M112 143 v14 M132 143 v14 M152 143 v14 M172 143 v14 M86 64 h14 M86 84 h14 M86 104 h14 M86 124 h14 M191 64 h14 M191 84 h14 M191 104 h14 M191 124 h14" />
      <path d="M145 70 L151 88 L169 94 L151 100 L145 118 L139 100 L121 94 L139 88 Z" />
      <path className="qh-sketch-depth" d="M226 52 Q224 44 233 44 L290 44 Q298 44 298 52 L298 80 Q298 88 290 88 L246 88 L234 98 L236 88 Q226 88 226 80 Z" transform="translate(6 6)" />
      <path className="qh-sketch-face" d="M226 52 Q224 44 233 44 L290 44 Q298 44 298 52 L298 80 Q298 88 290 88 L246 88 L234 98 L236 88 Q226 88 226 80 Z" />
      <path className="qh-sketch-soft" d="M238 60 Q262 58 286 60 M238 72 Q256 71 270 72" />
      <path className="qh-sketch-dash" d="M206 96 Q216 88 226 88" />
      <ellipse className="qh-sketch-shade" cx="160" cy="180" rx="110" ry="6" />
    </svg>
  )
}

/** 이메일 주소 탭(ARTEL-1380): 반쯤 열린 봉투와 거기서 나오는 초대장 한 장. */
export function MailSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-face" d="M120 30 Q119 22 128 22 L214 21 Q223 21 223 30 L224 104 L120 106 Z" />
      <path className="qh-sketch-soft" d="M138 44 Q170 42 204 44 M138 60 Q164 58 190 60" />
      <path d="M150 78 l6 6 l12 -12" />
      <path className="qh-sketch-depth" d="M82 84 L262 82 L262 168 L82 170 Z" transform="translate(9 8)" />
      <path className="qh-sketch-face" d="M82 84 L172 132 L262 82 L262 160 Q262 168 254 168 L90 170 Q82 170 82 162 Z" />
      <path d="M82 84 L172 132 L262 82" />
      <path className="qh-sketch-soft" d="M82 166 L150 124 M262 164 L194 124" />
      <path className="qh-sketch-soft" d="M60 40 l0 10 M55 45 l10 0 M286 36 l0 8 M282 40 l8 0" />
      <ellipse className="qh-sketch-shade" cx="172" cy="184" rx="104" ry="6" />
    </svg>
  )
}

/** 환경 탭(ARTEL-1380): 화면 하나와 그 앞의 언어 토글. 토글 한쪽이 켜져 있다. */
export function DisplaySketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d="M70 26 L256 24 L258 132 L72 134 Z" transform="translate(9 9)" />
      <path className="qh-sketch-face" d="M70 34 Q69 25 79 25 L246 24 Q256 24 256 33 L257 124 Q257 133 247 133 L80 134 Q71 134 71 125 Z" />
      <path className="qh-sketch-soft" d="M92 52 Q130 50 172 52 M92 70 Q120 69 150 70" />
      <path className="qh-sketch-dash" d="M92 92 L136 92" />
      <path d="M150 134 L146 154 M178 134 L182 154 M128 156 Q164 152 200 156" />
      <path className="qh-sketch-depth" d="M196 96 Q196 84 208 84 L262 84 Q274 84 274 96 Q274 108 262 108 L208 108 Q196 108 196 96 Z" transform="translate(5 5)" />
      <path className="qh-sketch-face" d="M196 96 Q196 84 208 84 L262 84 Q274 84 274 96 Q274 108 262 108 L208 108 Q196 108 196 96 Z" />
      <circle cx="252" cy="96" r="8" />
      <path className="qh-sketch-soft" d="M210 96 h14" />
      <ellipse className="qh-sketch-shade" cx="166" cy="178" rx="112" ry="6" />
    </svg>
  )
}

/** CLI 토큰 탭(ARTEL-1380): 프롬프트가 깜박이는 터미널 창과 그 옆의 토큰 꼬리표. */
export function TerminalSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d="M56 28 L238 26 L240 150 L58 152 Z" transform="translate(9 9)" />
      <path className="qh-sketch-face" d="M56 36 Q55 27 65 27 L228 26 Q238 26 238 35 L239 142 Q239 151 229 151 L66 152 Q57 152 57 143 Z" />
      <path className="qh-sketch-soft" d="M57 46 L238 45" />
      <circle className="qh-sketch-soft" cx="70" cy="36" r="3" />
      <circle className="qh-sketch-soft" cx="82" cy="36" r="3" />
      <path d="M76 70 l12 9 l-12 9" />
      <path className="qh-sketch-soft" d="M98 88 Q130 86 160 88" />
      <path d="M76 108 l12 9 l-12 9" />
      <path className="qh-sketch-dash" d="M98 126 L112 126" />
      <path d="M252 92 L292 80 L300 88 L300 108 L260 120 L252 112 Z" />
      <circle cx="259" cy="103" r="2.5" />
      <path className="qh-sketch-soft" d="M268 104 L290 97 M268 112 L282 108" />
      <path className="qh-sketch-dash" d="M240 104 L252 102" />
      <ellipse className="qh-sketch-shade" cx="168" cy="182" rx="128" ry="6" />
    </svg>
  )
}

/** 프로필 탭(ARTEL-1380): 둥근 얼굴 자리와 이름 줄이 있는 신분증 한 장, 옆에 걸린 꼬리 끈. */
export function IdCardSketch() {
  return (
    <svg aria-hidden="true" className="qh-sketch" fill="none" viewBox="0 0 330 196">
      <path className="qh-sketch-depth" d="M74 50 L256 48 L258 160 L76 162 Z" transform="translate(9 9)" />
      <path className="qh-sketch-face" d="M74 58 Q73 49 83 49 L246 48 Q256 48 256 57 L257 152 Q257 161 247 161 L84 162 Q75 162 75 153 Z" />
      <path className="qh-sketch-soft" d="M150 30 L150 49 M180 30 L180 49 M150 30 Q165 20 180 30" />
      <circle cx="122" cy="104" r="24" />
      <path className="qh-sketch-soft" d="M106 120 Q122 108 138 120" />
      <circle className="qh-sketch-soft" cx="122" cy="96" r="8" />
      <path d="M164 90 Q196 88 230 90" />
      <path className="qh-sketch-soft" d="M164 110 Q190 109 216 110" />
      <path className="qh-sketch-dash" d="M164 130 L200 130" />
      <path className="qh-sketch-soft" d="M282 60 l0 10 M277 65 l10 0" />
      <ellipse className="qh-sketch-shade" cx="168" cy="182" rx="112" ry="6" />
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
