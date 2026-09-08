# 저작 스튜디오가 대화를 지키고, 칸마다 스크롤한다

- Jira: ARTEL-829
- 브랜치: `fix/home-저작-스튜디오에서-시나리오를-고르면-대화가-사라지고-사이드바가-화면-밖으로-밀린다-ARTEL-829`
- 대상: `src/testScenarios/`, `src/testRuns/RunChat.tsx`, `src/design-system/primitives/`, `src/App.css`

## 무엇이 문제였나

한 화면에 세 가지가 겹쳐 있었다.

1. **시나리오를 고를 때마다 화면이 통째로 다시 그려진다.** `TestScenarioRoute` 가
   `key={testScenarioId}` 로 페이지를 remount 했다. 오른쪽 대화는 시나리오가 아니라
   run 에 속하는데(`useRunChatSession`) 시나리오-scoped 트리 안에 있어 같이 버려졌다.
2. **가운데 STEP 이 길면 좌·우 rail 이 화면 밖으로 밀린다.** `.app-shell` 이
   `min-height:100vh` 뿐이라 `1fr` 행이 내용만큼 늘어나고, `height:100%` 인 studio 도
   따라 늘어나 각 칸의 `overflow-y:auto` 가 한 번도 발동하지 않았다.
3. **rail 목록에 가로 스크롤바가 선다.** `.scnrow-main` 에 CSS 가 없어 grid 의
   `min-width:auto` 를 그대로 썼고, `.scnrow-name` 이 inline 이라 이미 걸려 있던
   `text-overflow:ellipsis` 도 듣지 않았다.

## 어떻게 고쳤나

### remount 를 걷어낸다

`key` 를 지우고, 시나리오-scoped 상태만 `scenarioId` 로 갈아탄다. `status` 는 어느
시나리오에 대한 결과인지를 함께 들어(`loaded.id === scenarioId`), 전환 첫 프레임에
이전 시나리오의 STEP 이 새 제목 아래 비치지 않게 한다.

remount 가 사라지면서 새로 생긴 위험 두 개를 `useStepEditor` 에서 막는다.

- **소유권.** 전환 직후 몇 프레임 동안 id 는 새것인데 draft 는 옛것이다. 그 사이
  autosave 가 돌면 A 의 STEP 이 B 에 덮인다. `ownerRef` 가 draft 의 주인을 들고,
  `reset(testScenarioId, draft)` 로 로드가 끝난 뒤에만 주인이 바뀐다.
- **넘겨주기.** 위 가드만 두면 600ms 안에 다른 행을 누른 사람의 마지막 편집이 말없이
  버려진다. 떠나는 시나리오에 빚진 것을 그 id 로 먼저 갚고 넘어간다.

### 높이를 못박고, 막대를 줄인다

`--shell-topbar-h` 로 상단바 높이에 이름을 붙이고, 스튜디오가 앉는 workspace 칸에
`height:calc(100vh - var(--shell-topbar-h))` 를 준다. 그때부터 세 칸이 각자 스크롤한다.

막대가 셋 서니 가운데가 답답해서, 가운데는 막대를 내주고 위·아래 화살표로 바꿨다
(TC spec 목록의 `.cp-fade` 와 같은 방식, 끝에 닿으면 그쪽 화살표가 사라진다). 남긴 둘은
화면 바깥쪽 끝으로 밀었다 — rail 의 막대를 왼쪽으로 보내는 방법은 스크롤 칸만 `rtl` 로
뒤집고 내용을 `ltr` 로 되돌리는 것뿐이다.

### 막대를 직접 그린다

두 가지를 알아내고 방향을 바꿨다.

- Chrome 은 `scrollbar-width` 나 `scrollbar-color` 가 지정돼 있으면
  `::-webkit-scrollbar` 규칙을 **통째로 무시한다.** 처음 `.qa-console` 에서 가져온
  규칙이 둘을 함께 써서, 의도한 모양은 한 번도 그려진 적이 없었다.
- 그걸 고치고 폭을 재 보니 macOS Chrome 기본이 11px, `scrollbar-width:thin` 도 11px 로
  아무 일도 하지 않는다. 기본 모양 자체가 얇고 둥근 회색이라 회색 후보는 손대지 않은
  것과 구분되지 않았다.

그리고 `::-webkit-scrollbar` 는 별도 레이어에 그려져 `transition` 이 걸리지 않는다.
"가까이 오면 굵어진다"를 CSS 만으로는 쓸 수 없어서, 네이티브를 숨기고
`EdgeScrollbar` 가 막대를 직접 그린다.

- 트랙은 통과시킨다(`pointer-events:none`). 살아 있으면 칸 가장자리 클릭을 삼키는데,
  rail 에서 그 가장자리는 모든 행의 일부다.
- 근접 감지는 **패널**에서 한다. 스크롤 칸에 걸었더니 굵어진 막대 위로 커서가 올라가는
  순간 칸에서는 `mouseleave` 가 나고 → 얇아지고 → 다시 칸 위가 되어 굵어지는 깜빡임이
  났고, 그 사이에 잡히지도 않았다.
- 잡는 면적(18px)과 그려지는 굵기(4 ↔ 11px)를 나눈다. 면적은 늘 살아 있다 —
  `.is-near` 일 때만 켰더니 막대에 닿자마자 누르는 사람은 상태가 바뀐 렌더가 도착하기
  전에 눌러 그대로 통과했다.
- 위치는 `scroll` · `ResizeObserver` · `MutationObserver` 셋으로 따라간다. 대화는 높이가
  고정된 칸 안에서 내용만 자라 `scrollHeight` 만 늘어나는데, `ResizeObserver` 는 그것을
  알려주지 않는다.

## 확인한 것

| 항목 | 결과 |
| --- | --- |
| 시나리오 전환 시 대화 DOM 노드 | 동일(`sameThreadNode: true`), 쓰다 만 문장 유지 |
| 같은 전환, `key` 있던 때 | 노드 교체, 표식·문장 소실 |
| 600ms 안에 전환하며 편집 | 표식이 떠나는 시나리오(125)에만 저장, 새로 연 34 는 그대로 |
| body 스크롤 | 없음 (`docScrollHeight == innerHeight`) |
| 칸별 스크롤 | 좌 1123/6026 · 중앙 1189/2820 · 우 859/1321 |
| rail 가로 스크롤 | 없음 (`scrollWidth 268 == clientWidth 268`) |
| 막대 위에서 상태 20회 | 흔들림 없음 |
| 좌 rail 끌기 | 0 → 5443 / 6272 |
| 우 대화 끌기 | 475 → 0 |
| `typecheck` · `lint` · `test` · `build` | 통과 / 새 오류 없음 / 427건 통과 / 통과 |

## 남긴 것

- `.qa-console` 의 스크롤바도 같은 이유(`scrollbar-width` + `::-webkit-scrollbar` 병용)로
  의도대로 안 나오고 있을 가능성이 높다. 이 이슈에서는 건드리지 않았다.
- 가운데 화살표는 모달의 것과 같이 표시만 하고 누를 수 없다.
- develop 에 `ContentMapTree` · `TestCaseLibrary` 의 대소문자 충돌이 있어 macOS 에서는
  `typecheck` 가 7건 실패하고 로컬 실행이 막힌다. 이 브랜치 이전부터 있던 것이고,
  화면 확인은 그 두 import 를 임시로 우회해 찍은 뒤 되돌렸다.
