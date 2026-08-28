# 2026-08-28 — [Home] 인스펙터에 캡처·기능·묶인 지식을 낸다

- Date: 2026-08-28
- Jira: ARTEL-598 (epic ARTEL-582; blocked by ARTEL-597)
- Branch: `feat/home-인스펙터에-캡처-기능-묶인-지식을-낸다-ARTEL-598`
- Base: `feat/home-씬-컨테이너-안에-화면을-중첩해-그린다-ARTEL-597`
- Status: Implemented

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
