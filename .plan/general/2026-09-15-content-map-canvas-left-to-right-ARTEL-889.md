# 2026-09-15 — content map 캔버스를 왼쪽에서 오른쪽으로 놓고 화면 캡처와 pane 접기를 붙인다

- Date: 2026-09-15
- GitHub Issue: None
- Jira: ARTEL-889
- Status: Reviewed (fast·medium 1차 반영)

## Goal

`/projects/:projectId/content-map` 의 씬 그래프가 세 가지를 다르게 한다.

1. entry 씬이 가장 왼쪽에 서고, 전이를 따라 깊어질수록 오른쪽으로 간다. 같은 layer 의 씬은 세로로 늘어선다.
2. 캔버스의 화면 노드가 `screen.image` 캡처를 띄운다. 이미지는 잘리지 않고 노드 안에 전부 들어온다.
3. tree 와 inspector 를 각각 접을 수 있고, 둘 다 접으면 캔버스가 가로 전체를 쓰고 더 높아진다.

## Non-goals

- 씬 대표 이미지(`scene.thumbnail`)를 캔버스에 넣지 않는다. inspector 에만 남는다.
- 씬 그래프와 화면 지도를 다시 두 화면으로 가르지 않는다.
- pane 폭을 끌어서 바꾸는 기능.
- 서버 응답 모양 변경.

## Context / Constraints

- 배치는 `src/contentMap/screenMapLayout.ts` 하나에 있고 순수 함수다. 난수도 반복 완화도 시계도 없다 —
  같은 응답은 언제나 같은 좌표를 낸다. 이 성질을 방향만 바꾸면서 그대로 지킨다.
- 캔버스(`ScreenMapCanvas`)는 `aria-hidden` 에 포인터 전용이다. 접기 버튼은 그림 밖에 둔다.
- `screen.image.url` 은 단기 서명 주소다. 만료되면 이미지가 깨지므로 `onError` 로 받아 자리표시로 바꾼다.
  `ScreenImage` 에는 픽셀 크기가 없으므로 노드는 고정 틀이고 `preserveAspectRatio="xMidYMid meet"` 이
  나머지를 letterbox 로 채운다. 그래야 어떤 비율이 와도 잘리지 않는다.
- 접힌 rail 은 48px 이다. `DESIGN.md` 가 정한 값이고 이 저장소에 이미 한 번 구현돼 있다 —
  `App.css:4425` 의 `.project-workspace:has(.project-nav--collapsed)`. 그 폭과 그 `:has()` 방식을 그대로 쓴다.
- 접기 아이콘도 이미 있다. `ProjectNav.tsx:57` 의 `CollapseIcon` 이고 지금은 그 파일 안에 숨어 있다.
  같은 앱 안에 접기 버튼이 두 가지 모양이 되지 않도록 primitive 로 꺼내 쓴다.
- 1024px 아래에서는 세 pane 이 한 줄로 쌓인다. 그 폭에서도 접기가 동작해야 한다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `screenMapLayout.ts`(678줄), `ScreenMapCanvas.tsx`(521줄), `ContentMapPage.tsx`,
      `App.css` 의 `.cm-workspace` / `.sm-*` / `.project-workspace` 규칙, `i18n/messages/contentMap.ts` 의
      영문·한국어 두 벌, `ProjectNav.tsx` 와 `navCollapse.ts` 의 기존 rail 접기.

### Step 1-A: 배치를 가로로 돌린다 — `src/contentMap/screenMapLayout.ts`

- [ ] `layoutScreenMap` 의 바깥 루프에서 두 축을 맞바꾼다. 누적 변수는 `top` 에서 `left` 가 되고,
      layer 안에서는 `top` 이 컨테이너마다 자란다. 함수 하나 안의 제자리 수정이고 새 추상은 없다.
  - 열 폭 `columnWidth` = 그 layer 에서 가장 넓은 컨테이너의 `width`.
  - 열 안 세로 총합 `totalHeight` = 높이 합 + `SIBLING_GAP × (n - 1)`. 시작 `top = -totalHeight / 2`
    이므로 y = 0 을 기준으로 가운데 정렬된다.
  - 컨테이너마다 `offset = (columnWidth - box.width) / 2` 로 열 안에서 가로 가운데에 놓는다.
- [ ] 간격 두 값을 새 방향에 맞게 다시 잡는다.
  - `LAYER_GAP` 88 → **120**. 씬 전이가 가로로 달리고 그 위에 조건 한 줄이 앉는다. 88 은 세로 간격일 때
    글자가 두 layer 사이에 들어갈 높이였고, 가로로는 라벨 폭을 감당하지 못한다.
  - `SIBLING_GAP` 56 → **64**. 자기 자신으로 가는 고리가 상자 **위쪽**으로 올라오므로(아래 참조),
    열 안에서 위 이웃과의 거리가 고리가 자라는 높이보다 커야 한다. `SELF_LOOP_RADIUS` 22 기준으로
    고리가 올라오는 높이가 약 44px 이다.
- [ ] `selfLink` 의 고리를 상자 오른쪽에서 위쪽으로 옮긴다. 오른쪽은 이제 다음 layer 로 나가는 선이
      지나는 자리다. 정확한 기하:
  ```
  radius  = SELF_LOOP_RADIUS + index * 9
  centreX = rect.x + rect.width / 2
  spread  = Math.min(rect.width * 0.18, radius * 0.8)
  path    = `M ${centreX - spread} ${rect.y} A r r 0 1 1 ${centreX + spread} ${rect.y}`
  midX    = centreX
  midY    = rect.y - radius * 1.7
  ```
  `spread` 를 반지름으로 묶는 것은 새 제약이다. 폭이 600px 인 컨테이너에서 `width * 0.18` 만 쓰면
  두 끝 거리가 지름보다 커져 SVG 가 반지름을 제멋대로 늘린다 — 지금은 세로였던 축에서 같은 함정이
  이미 있었고, 컨테이너가 가로로 넓어지는 이번 배치에서 실제로 걸린다.
- [ ] 화면 노드 크기를 캡처가 들어갈 만큼 키운다. `SCREEN_WIDTH = 176`, `SCREEN_IMAGE_HEIGHT = 100`,
      `SCREEN_HEIGHT = 134`. 셋만 export 한다 — 글자 띠 높이는 `SCREEN_HEIGHT - SCREEN_IMAGE_HEIGHT` 로
      나오므로 네 번째 상수를 두면 세 값이 어긋날 자리만 생긴다.
- [ ] 방향을 사실로 적어 둔 주석을 함께 고친다. 모듈 머리글, `LAYER_GAP` 과 `SIBLING_GAP` 의 설명,
      `assignLayers` 의 "위에서 아래로 읽는 그림", `orderLayer` 의 "줄 끝", `layoutScreenMap` 안의
      "줄을 x = 0 을 기준으로 가운데 정렬한다"와 "줄 안에서 세로 가운데"(546–549행), `selfLink` 의
      "상자 오른쪽에 매달리는 고리". 이 파일은 결정마다 이유를 옆에 적는 문체라, 남은 방향 설명은
      낡은 것이 아니라 틀린 것이 된다.
- [ ] `orderLayer` 자체는 건드리지 않는다. 선행의 자리 평균으로 정렬하는 규칙은 축과 무관하다.

### Step 1-B: 화면 노드가 캡처를 띄운다 — `src/contentMap/ScreenMapCanvas.tsx`

- [ ] `ScreenMark` 를 두 띠로 나눈다. 위 `SCREEN_IMAGE_HEIGHT`(100) 는 캡처 자리, 아래 34 는 글자 두 줄.
  - 캡처 자리는 노드 안쪽으로 4px 물러선 `x=4, y=4, width=168, height=92` 다. 노드 테두리가 `rx=4` 로
    둥글기 때문에, 물러서지 않으면 이미지 모서리가 테두리 밖으로 비어져 나온다. `clipPath` 를 노드마다
    두는 것보다 싸다.
  - 이름과 관측 횟수는 baseline `y = 114`, `discriminator` 는 `y = 129`.
- [ ] 세 갈래를 그린다.
  - `screen.image` 가 있고 아직 안 깨졌으면 `<image>` — `preserveAspectRatio="xMidYMid meet"`,
    `href={screen.image.url}`, `onError` 가 오면 아래 갈래로 내려간다.
  - `screen.image` 가 null 이면 자리표시: `--color-bg-raised` 로 채운 `rect` 와 가운데 한 줄
    `copy.noCapture` ("아직 캡처 없음"), 글자색 `--color-text-muted`.
  - `onError` 로 깨진 경우도 같은 자리표시에 문구만 `copy.captureBroken` ("캡처를 불러오지 못함").
    두 사실은 사용자가 할 일이 다르다 — 앞은 QA 런을 돌리는 것이고 뒤는 새로고침이다.
  - 깨짐 상태는 `ScreenMark` 안의 `useState` 이되 **boolean 이 아니라 실패한 url** 이다.
    `const [failedUrl, setFailedUrl] = useState<string | null>(null)` 이고 판정은
    `failedUrl === screen.image.url`. boolean 으로 들면 새로고침이 안 듣는다 — React key 가
    `placed.screen.id` 라 새 snapshot 이 새로 서명된 url 을 같은 instance 에 넣고, boolean 은
    unmount 될 때까지 안 풀려서 화면이 새 url 을 받고도 "불러오지 못함"을 계속 띄운다.
    문구가 새로고침하라고 말하는데 새로고침이 듣지 않는 상태가 된다.
- [ ] `ContainerMark` 는 손대지 않는다. 씬 대표 이미지는 inspector 의 것이다.
- [ ] 모듈 머리글의 "색을 빼고 읽어도 전부 갈린다" 표에 캡처 줄을 더하지 않는다 — 캡처는 상태를
      말하는 채널이 아니라 그 화면이 무엇인지를 말하는 그림이다.

### Step 1-C: tree 와 inspector 를 접는다

- [ ] `src/design-system/primitives/CollapseIcon.tsx` 를 새로 만들고 `ProjectNav.tsx:57` 의 같은 함수를
      거기로 옮긴다. `ProjectNav` 는 import 만 바뀐다. 파일 두 곳에 같은 chevron 이 생기는 것을 막는
      최소한의 이동이고, `DESIGN.md` 가 이미 `design-system/primitives/` 를 그 자리로 지정해 뒀다.
- [ ] `src/contentMap/contentMapPanes.ts` — 접힘을 `localStorage` 에 남긴다. `navCollapse.ts` 를 그대로
      본뜬다(키 `artel.contentMap.treeCollapsed`, `artel.contentMap.inspectorCollapsed`, 실패는 조용히
      기본값). 한 번 접은 사람이 빌드를 옮길 때마다 다시 접어야 한다면 접기 자체가 쓸모없다.
- [ ] `ContentMapPage.tsx` 의 `SceneGraphView` 가 `treeOpen` / `inspectorOpen` 두 boolean 을 든다.
      상태는 그 컴포넌트 안에만 있고 context 도 store 도 만들지 않는다.
  - 버튼은 각 `<aside>` 의 **첫 자식**이다. `<aside>` 밖 형제로 두면 `.cm-workspace` 의 직계 자식이
    셋에서 다섯이 되어 grid 가 둘째 줄로 흘러내리고, 48px 폭이 버튼이 아니라 `<aside>` 칸에만 걸린다.
    버튼에는 `aria-expanded`, `aria-controls`, `CollapseIcon`, 그리고 펼쳤을 때만 보이는 이름표를 둔다.
  - 내용은 언제나 mount 된 채로 `hidden` 으로 감춘다. 언마운트하면 tree 가 펼쳐 둔 가지와 스크롤
    자리를 잃고, `aria-controls` 가 없는 id 를 가리키게 된다.
  - 접힌 `<aside>` 에 `cm-tree-pane--collapsed` / `cm-inspector-panel--collapsed` 를 붙인다.
  - `ContentMapPage.tsx:295-299` 의 `scrollIntoView` effect 에 `if (!inspectorOpen) return` 을 더한다.
    접힌 inspector 는 48px 막대이고 내용이 `hidden` 이라, 그대로 두면 무언가를 고를 때마다 페이지가
    빈 막대로 스크롤한다. 자동으로 펼치지는 않는다 — 접은 것은 캔버스를 크게 보려는 선택이고,
    클릭 한 번마다 되펼쳐지면 접기가 쓸모없어진다.
- [ ] `App.css` — 폭을 custom property 두 개로 돌리고 `:has()` 로 바꾼다. 조합 네 가지를 손으로
      나열하지 않는다.
  ```css
  .cm-workspace { --cm-tree-width: 260px; --cm-inspector-width: 360px;
                  grid-template-columns: var(--cm-tree-width) minmax(0,1fr) var(--cm-inspector-width); }
  @media (max-width: 1279px) { .cm-workspace { --cm-tree-width: 216px; --cm-inspector-width: 320px; } }
  .cm-workspace:has(.cm-tree-pane--collapsed)      { --cm-tree-width: 48px; }
  .cm-workspace:has(.cm-inspector-panel--collapsed){ --cm-inspector-width: 48px; }
  ```
  `:has()` 를 단 규칙은 특정도가 한 단계 높아 media query 안의 규칙을 이긴다. 그래서 1279px 아래에서도
  접힌 쪽은 48px 이다.
- [ ] `.cm-inspector-panel`(`App.css:6644`)을 tree pane 과 같은 모양으로 맞춘다 —
      `display: flex; flex-direction: column` 을 걸고, `.cm-inspector`(`App.css:6661`)에서
      `max-height: inherit` 를 빼고 `min-height: 0` 을 준다. 지금 이 패널은 block 에
      `max-height: calc(100vh - var(--space-12))` 와 `overflow: hidden` 이고, 스크롤을 드는
      `.cm-inspector` 가 부모와 **같은** `max-height` 를 상속받는다. 유일한 자식일 때는 딱 맞지만
      버튼 한 줄이 첫 자식으로 들어오면 합이 버튼 높이만큼 넘치고, `overflow: hidden` 이 그만큼을
      잘라 낸다 — detail 의 마지막 줄들에 끝까지 스크롤해도 닿지 못하는 띠가 생긴다. 바로 그 규칙
      위 주석이 이미 경고해 둔 함정이다. tree pane 은 이미 flex column 이라 걸리지 않는다.
- [ ] 접힌 pane 의 내용을 실제로 감추는 규칙을 적는다. `hidden` 속성만으로는 안 감춰진다 —
      `.cm-tree-panel`(`App.css:6507`)과 `.cm-inspector`(`App.css:6661`)가 둘 다 `display: flex` 를
      class 로 걸고, user agent sheet 의 `[hidden] { display: none }` 은 author rule 에 진다.
      `App.css` 에 `[hidden]` 규칙이 하나도 없어 깔린 안전망도 없다. 전역으로
      `[hidden] { display: none !important; }` 를 둔다 — 이 저장소가 `hidden` 속성을 쓰는 첫 자리이고,
      두 pane 에만 좁게 적으면 다음에 `hidden` 을 쓰는 사람이 같은 함정을 다시 밟는다.
- [ ] 캔버스 높이도 같은 방식이다. 기본 `--cm-canvas-height: clamp(400px, 60vh, 720px)`, **둘 다** 접혔을
      때만 `clamp(480px, 78vh, 1080px)`. 한쪽만 접은 상태는 기본 높이를 쓴다 — 그때 얻은 것은 폭이고,
      높이까지 같이 늘리면 한 번 누를 때마다 그림이 두 방향으로 뛴다.
- [ ] **구현 중 추가한 결정** — 캔버스 틀의 높이를 고정값이 아니라 그림의 비율에서 받는다.
      `aspect-ratio: var(--cm-canvas-ratio)` 에 `min-height: 360px` 와 위의 `--cm-canvas-height` 를
      천장으로 둔다. 비율은 `layout.width / layout.height` 를 inline custom property 로 넘긴다.

      계획에 없던 변경이고, 1440px 캡처를 보고 넣었다. layer 가 가로로 늘어선 뒤로 그림이 늘 납작해서,
      720px 짜리 틀 가운데에 200px 짜리 띠 하나만 뜨고 위아래 500px 이 통째로 비었다. `meet` 는 틀을
      채우지 않고 맞추기만 하므로 그 빈 자리는 확대해도 줄지 않는다. 바닥 360px 은 `DESIGN.md` 의
      replay viewport 최소 `640 × 360` 에서 가져왔다 — 확대했을 때 들여다볼 자리가 남아야 한다.
- [ ] 1023px 아래에서는 세 pane 이 쌓인다. 접힌 pane 은 폭이 아니라 높이 48px 짜리 가로 막대가 되고,
      버튼과 이름표가 그 안에서 왼쪽에 선다.
- [ ] `transition` 은 `.project-workspace` 와 같은 `var(--motion-fast) var(--ease-standard)` 이고
      `prefers-reduced-motion` 에서 끈다.

### Step 1-D: 문구 — `src/i18n/messages/contentMap.ts`

- [ ] 영문·한국어 두 벌에 넣는다: `screenMap.noCapture`, `screenMap.captureBroken`,
      `panes.tree`, `panes.inspector`, `panes.expand(name)`, `panes.collapse(name)`.

### Step 2: Tests — `src/contentMap/screenMapLayout.test.ts`

- [ ] `entry 씬이 첫 layer 에 서고 뒤따르는 씬이 아래로 쌓인다` → 이름과 단언을 함께 고친다.
      234–235행의 `.y` 비교를 `.x` 비교로 바꾼다:
      `assert.ok(byName.get('Map_scene')!.x > byName.get('TitleScene')!.x)` 와 BattleScene 도 같다.
      layer 번호 단언 229–232행은 그대로 둔다.
- [ ] `화면이 스물인 씬이 이웃과 한 줄에 서도 겹치지 않고 세로 가운데에 놓인다` → 한 열, 가로 가운데로.
      427행의 겹침 단언은 `big.y + big.height <= small.y || small.y + small.height <= big.y` 가 되고,
      430–432행의 가운데 단언은 `container.x + container.width / 2` 두 개를 비교한다.
- [ ] 캡처가 있는 화면과 없는 화면이 같은 크기 상자를 받는지 확인하는 시험을 더한다. 배치는 `image` 를
      읽지 않는다는 사실을 못 박는 자리다.
- [ ] 결정성, 컨테이너 안에 화면이 들어 있는지, 뷰 박스가 전부를 감싸는지 — 이 셋은 축과 무관하므로
      고치지 않고 통과해야 한다. 통과하지 않으면 축 교환이 아니라 다른 것을 깨뜨린 것이다.

### Step 3: Rollout / Rollback

- [ ] flag 없음. 화면 하나의 배치와 표시만 바뀌고 서버 계약은 그대로다. 되돌리려면 commit 을 revert 한다.

## Validation

- **Commands to run:** `npm run test`, `npm run lint`, `npm run typecheck`
- **Expected output:** 세 명령 모두 통과. 배치 시험은 가로 방향 단언으로 바뀐 채 통과한다.
- **Manual:** 로컬 stack 에 붙여 1024px 와 1440px 두 폭에서 캡처한다. 캡처가 있는 화면, 캡처가 없는 화면,
  pane 을 둘 다 접은 상태 세 가지를 남긴다.

## Risks & Rollback

- **Risks:**
  - 화면 노드가 152 × 48 에서 176 × 134 로 커져 컨테이너가 2.8배 높아진다. 화면이 스물인 씬에서 그림
    전체가 커지고, 기본 배율에서 글자가 작아진다. pane 접기가 그 폭을 되돌려 주지만 좁은 화면에서는
    확대가 필요하다.
  - 화면 수만큼 서명된 주소로 이미지 요청이 나간다. 캡처가 많은 빌드에서 첫 렌더가 느려질 수 있다.
    `<image>` 에는 lazy loading 이 없다.
  - 서명 만료가 잦으면 자리표시만 보이는 그림이 된다. 그때도 `onError` 자리표시가 사실을 말한다.
  - `:has()` 는 Safari 15.4 이상이다. 이 앱은 이미 `.project-workspace` 에서 같은 선택자를 쓰고 있어
    지원 범위가 넓어지지 않는다.
- **Rollback steps:** `git revert`

## Rejected feedback

- **fast #6 — 한쪽만 접은 조합마다 grid 규칙을 따로 적는다**: 적지 않는다. 폭 두 개를 custom property 로
  돌리면 조합 네 가지가 규칙 두 개에서 자동으로 나온다. 나열하면 breakpoint 마다 여섯 줄이 되고, 나중에
  폭 하나를 바꿀 때 고칠 자리가 여섯 곳이 된다.
- **fast #7 — 한쪽만 접었을 때의 중간 높이**: 두지 않는다. 한쪽만 접어서 얻는 것은 폭이다. 높이까지
  단계별로 움직이면 버튼 한 번에 그림이 두 방향으로 뛴다.

## Open Questions

- 없음. 캔버스에 무엇을 띄울지는 사용자가 골랐다 — 화면 노드는 캡처, 씬 대표 이미지는 inspector.
