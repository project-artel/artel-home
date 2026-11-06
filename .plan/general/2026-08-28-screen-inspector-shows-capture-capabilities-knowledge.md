# 2026-08-28 — [Home] 인스펙터에 캡처·기능·묶인 지식을 낸다

- Date: 2026-08-28
- Jira: ARTEL-598 (epic ARTEL-582; blocked by ARTEL-597)
- Branch: `feat/home-인스펙터에-캡처-기능-묶인-지식을-낸다-ARTEL-598`
- Base: `feat/home-씬-컨테이너-안에-화면을-중첩해-그린다-ARTEL-597`
- Status: Implemented, then reworked into three panes (see `## Rework — 세 pane`)

## Goal

ARTEL-597 이 만든 중첩 다이어그램에 인스펙터를 붙인다. 화면을 고르면 그 화면의 캡처·discriminator·
capability·묶인 지식·나가는 screen transition 이 한 자리에 뜨고, 씬을 고르면 씬 수준의 요약이 뜬다.

캔버스는 포인터 전용에 `aria-hidden` 이다. 그래서 이 패널은 편의 기능이 아니라 **그림의 대등한
대체물**이다 — 그림에서 고를 수 있는 네 갈래(scene · screen · scene edge · screen transition)가
전부 여기 버튼으로 있어야 한다.

## Non-goals

- 편집하지 않는다. 읽기 전용이다.
- 기존 `SceneGraphInspector`(평면 씬 그래프 쪽)를 고치지 않는다. 이 패널은 그것의 형제다.
- 다른 저장소는 손대지 않는다. 서버 계약은 이미 있는 것만 쓴다.
- `screen_capability` 표를 조회하는 새 API 를 만들지 않는다.

## Context

### 서버가 지금 주는 것 (orchestration `ContentMapViewDtos.kt`, ARTEL-596)

- `scenes[].screens[].image: { url, expiresAt, capturedAt }?` — 씬 대표 이미지와 **같은 서명 경로**
  (`DocumentStorage.presignDownload`). 없으면 통째로 null 이다. `state`/`reason` 이 없다 — `screen`
  표에 실패 코드 칸이 없어서 가를 두 상태가 없다.
- `scenes[].capabilityList[]` — `id` · `summary` · `status` · `origin` · `verification` ·
  `actionability` · `observability` · `applicability` · `interaction`. `capabilityList.size` 는
  `capabilities.total` 과 같다(`steps` 는 `not-a-step` 을 뺀 부분집합이다).
- `screenTransitions[]` — `id` · `fromScreenId` · `toScreenId` · `capabilityId?` ·
  `capabilitySummary?` · `kind` · `crossesScene` · `observedCount` · `firstSeenQaRunId?`.
- `gaps[]` — 이 **지도 전체**의 사유별 집계다. 씬별로 갈라져 있지 않다.

### 서버가 주지 않는 것

| 원하는 것 | 표 | 조회 응답 |
|---|---|---|
| screen ↔ capability 직접 연결 | `screen_capability` (134 행) | 없음 |
| screen transition 의 verified 칸 | 없음 (`verified_at` 은 `scene_edge` 에만) | 없음 |
| 씬별 gap 사유 | `scene.gaps` jsonb | 없음. 지도 전체 집계만 |
| 화면에 묶인 지식 | `knowledge_anchor.screen_id` | content-map 응답에는 없음. 지식 그래프 조회에 있음 |

그래서 세 가지를 **유도**한다. 어느 것도 서버가 말하지 않은 사실을 지어내지 않고, 화면 문구가
유도했다는 것을 그대로 말한다.

1. **화면의 capability** — 이 화면에서 나가는 screen transition 이 쓴 capability 를 모은다.
   `capabilityId` 를 모든 씬의 `capabilityList` 를 합친 색인에서 찾아 `origin` 과 `verification` 을
   붙인다. 문구는 "이 화면에서 나가는 전이가 쓴 capability" 라고 적는다.
2. **screen transition 의 verification** — 전이 자체에는 그런 칸이 없다. 그 전이를 일으킨
   capability 의 `verification` 을 배지로 붙이고, 자동 전이(capability 없음)는 "확인할 capability 가
   없다"로 따로 말한다. 관측 횟수는 그것대로 함께 적는다 — 전이 행이 있다는 것 자체가 관측된 사실이다.
3. **gap 사유** — 지도 전체 집계임을 제목에 적고 그대로 보인다. 씬별인 척하지 않는다.

### 묶인 지식

`GET /api/projects/{projectId}/knowledge-graph` 가 이미 노드마다
`anchors: [{ sceneName, screenId }]` 를 싣는다(orchestration ARTEL-605). 화면 지도 섹션이 그 조회를
한 번 더 하고, `anchor.screenId === screen.id` 인 노드를 고른다.

## Constraints

### 캡처는 아직 아무 화면에도 없다

살아 있는 DB 의 화면 30 행이 전부 `image_object_key = NULL` 이다. 캡처를 내보내는 agent-server 쪽
(ARTEL-595)도 그것을 묶는 orchestration 쪽(ARTEL-456)도 아직 할 일이다. 그래서 **캡처 없음이 지금
사용자가 실제로 보는 상태다.** 오류로도 로딩으로도 그리지 않고, "이 화면은 아직 캡처가 없다"고
말하는 정상 상태로 그린다.

### 이름 없는 화면이 보통이다

`screen.name` 은 nullable 이고 대개 비어 있다. 이름 자리를 비워 두지 않고 "이름 없는 화면"이라고
적은 뒤, 그 화면을 실제로 가르는 것은 `discriminator` 라고 말한다.

### discriminator 를 raw JSON 덩어리로 두지 않는다

`[{"selector":"Canvas[2]/continue[2]","active":true}]` 를 selector 와 켜짐/꺼짐의 목록으로 읽어
낸다. 다만 서버는 이 값을 **읽지 않고 그대로 옮기므로** 모양을 못 박을 수 없다. 아는 모양
(`selector` 문자열 + `active` 불리언, 그 둘뿐)일 때만 목록으로 그리고, 하나라도 어긋나면 원문을
그대로 보인다 — 모르는 키를 조용히 버리면 화면이 서버가 말한 것에 대해 거짓말을 한다.

### 색만으로 말하지 않는다

`DESIGN.md` 가 금지한다. `origin` 과 `verification` 배지는 글자를 갖고, 상태는 테두리 굵기·점선·
글머리 기호로 한 번 더 갈린다. 그림자는 쓰지 않는다.

### 접근성 분업을 깨지 않는다

SVG 는 `aria-hidden` 인 채로 둔다. 캔버스에 포커스를 넣지 않는다. 인스펙터의 버튼이 유일한 키보드
경로다.

## Design

```text
src/contentMap/
  contentMapTypes.ts        (수정) ScreenImage, SceneCapability, origin/verification 스타일
  contentMapApi.ts          (수정) image · capabilityList 파싱
  screenDiscriminator.ts    (신규) discriminator 원문 → 읽히는 절 목록
  screenInspection.ts       (신규) 응답 → 인스펙터가 그릴 view model (순수 함수)
  ScreenMapInspector.tsx    (신규) 패널
  ContentMapSection.tsx     (수정) 선택 상태를 캔버스와 패널이 나눠 쓰게 배선
```

순수 함수는 전부 `.ts` 에 둔다 — `npm test` 가 `src/**/*.test.ts` 만 돌린다.

### `screenInspection.ts`

```ts
indexContentMap(view): ContentMapIndex      // scene · screen · capability · 나가고 들어오는 전이
readScreenEvidence(index, screenId): ScreenEvidence | null
readSceneEvidence(index, view, sceneId): SceneEvidence | null
anchoredToScreen(nodes, screenId): KnowledgeNode[]
```

색인을 한 번 만들어 두는 이유는 화면을 고를 때마다 30 개 화면과 39 개 전이를 다시 훑지 않기
위해서다. 배치와 같은 이유로 응답 말고는 아무것에도 기대지 않는다.

## Validation

- `npm run typecheck`
- `npm test`
- 브라우저에서 채워진 상태와 빈 상태를 직접 열어 스크린샷을 남긴다.

## Risks

- 화면의 capability 를 나가는 전이에서 유도한다. `screen_capability` 가 조회에 실리는 날 이
  유도는 그 목록으로 바뀌어야 하고, 그때까지는 "나가는 전이가 쓴" 것만 보인다. 문구가 그것을
  말한다.
- 지식 그래프 조회가 한 번 더 붙는다. 실패해도 화면 지도는 그대로 그려지고 지식 절만 못 읽었다고
  말한다.


## Rework — 세 pane

살아 있는 stack 에서 화면을 열어 보니 인스펙터가 하는 일이 보이지 않았다. 원인은 배선이 아니라
배치였다.

1. `.cm-workspace` 가 `minmax(0, 1fr) 360px` 이고 1023px 아래에서 한 칸으로 접혔다. 그러면
   인스펙터가 캔버스 패널 **아래**로 내려가 화면 밖에 앉는다. 캔버스를 클릭하면 그림만 밝아지고
   아무 일도 일어나지 않은 것처럼 보인다.
2. 넓은 화면에서도 그 360px 안에 detail · 씬 목록 · 전이 목록 셋이 세로로 쌓여 있었다. 아래쪽
   목록에서 한 줄을 고르면 답이 **스크롤 위쪽**에서 바뀐다.

### 무엇으로 바꿨나

```text
┌──────────┬───────────────────────────┬─────────────┐
│   tree   │          canvas           │  inspector  │
│          │        (pan/zoom)         │   detail    │
└──────────┴───────────────────────────┴─────────────┘
```

- **왼쪽 tree** — 예전의 씬 목록과 전이 목록 둘이 하나의 tree 로 합쳐졌다. 캔버스가
  `aria-hidden` 이라 이것이 유일한 키보드·스크린 리더 경로이고, 문은 뒤가 아니라 앞에 있어야 한다.
- **가운데 canvas** — 그대로. viewport 컨트롤도 그대로.
- **오른쪽 detail** — `SelectionDetail` 하나만. 여기 뜨는 것은 언제나 방금 고른 그것이다.

### tree 의 모양

```text
▾ Scene
    ▾ Screen
        → 그 screen 에서 나가는 screen transition
    → 그 scene 에서 나가는 scene edge
```

씬은 접힌 채로 시작한다. 실측 빌드의 `TurnBattleScene` 하나가 화면 스물아홉 개를 물고 있어서,
펼친 채로 시작하면 "이 빌드에 어떤 씬이 있나"라는 첫 질문이 스크롤 밖으로 밀린다.

씬 경계를 넘는 screen transition 은 출발 화면 밑에만 한 번 선다. 도착 씬 밑에 한 번 더 놓으면
전이 하나가 둘로 읽히므로, 대신 그 줄이 "어느 씬으로 나가는지"를 줄 안에서 말한다.

### 이어져 있다는 느낌을 만드는 것

- 캔버스에서 고르면 tree 가 그 가지를 펼치고, 그 줄을 밝히고, 스크롤해서 보인다.
- tree 에서 고르면 캔버스가 그것을 밝힌다.
- 선택이 바뀔 때마다 detail 패널도 `scrollIntoView({ block: 'nearest' })` 로 따라온다. 넓은
  화면에서는 아무 일도 일어나지 않고, 좁아져 쌓인 뒤에만 일한다.

셋 중 하나라도 빠지면 pane 이 셋이 된 것 말고는 달라진 것이 없다.

### 좁아질 때

| 폭 | 배치 | 왜 |
|---|---|---|
| `>= 1280px` | 260 / 1fr / 360 | 셋이 다 선다 |
| `1024–1279px` | 216 / 1fr / 320 | 캔버스가 먼저 양보한다. 그림은 pan/zoom 이 있어 좁아져도 볼 수 있지만 tree 와 detail 은 글자라 좁아지면 못 읽는다 |
| `< 1024px` | canvas → detail → tree | 접히는 것은 tree 다. 고른 것이 뜨는 곳이 화면 밖으로 나가는 것이 이 배치가 고친 버그 그 자체다. detail 은 `min(680px, 75vh)` 로 묶여 그 아래 tree 가 몇 화면 밑으로 밀리지 않는다 |

### 키보드

`role="tree"` · `treeitem` · `aria-level` / `aria-posinset` / `aria-setsize` / `aria-expanded` /
`aria-selected`, roving tabindex. 위아래로 줄을 옮기고, 오른쪽·왼쪽으로 펼치고 접고 부모로
올라가고, Home·End 로 끝으로, Enter·Space 로 고른다. 캔버스는 여전히 포커스를 받지 않는다.

펼침 상태는 색이 아니라 삼각형의 방향(`▸` / `▾`)이 말하고, 스크린 리더에는 `aria-expanded` 가
같은 것을 말한다.

### 결정이 든 것은 전부 순수 함수로

`contentMapTree.ts` — tree 를 세우는 것, 접힌 상태에서 보이는 줄을 고르는 것, 선택이 어느 가지
안에 있는지 되짚는 것, 키 하나가 무엇을 뜻하는지. `contentMapTree.test.ts` 가 16 개로 잡는다.
