# 2026-08-27 — [Home] 씬 컨테이너 안에 화면을 중첩해 그린다

- Date: 2026-08-27
- Jira: ARTEL-597 (epic ARTEL-582; blocked by ARTEL-596, blocks ARTEL-598)
- Branch: `feat/home-씬-컨테이너-안에-화면을-중첩해-그린다-ARTEL-597`
- Base: `origin/develop`
- Status: Implemented

## Goal

씬을 컨테이너로, 화면을 그 안의 노드로 그리는 중첩 다이어그램을 새로 만든다. 프로젝트 작업공간에 섹션으로
붙이고 빌드를 고를 수 있게 한다. 아직 못 가본 씬 전이가 구멍으로 보이게 한다.

## Non-goals

- 인스펙터 패널은 ARTEL-598 이다. 선택 개념만 내보내고 패널은 만들지 않는다.
- 편집하지 않는다. 읽기 전용이다.
- 화면 캡처 이미지(`screen.image`)는 ARTEL-598 이 그린다.
- 기존 `SceneGraphCanvas`(평면 씬 그래프)를 고치거나 지우지 않는다.
- 다른 저장소는 손대지 않는다.

## Context

`src/contentMap/` 는 이미 있다. 평면 씬 그래프(`sceneGraphLayout.ts` + `SceneGraphCanvas.tsx`)가
`/projects/:projectId/game-builds/:buildId/content-map` 에서 돌고, `contentMapApi.ts` 가 응답을 파싱한다.
이 작업은 그 위에 **두 번째 그림**을 얹는다 — 같은 응답의 다른 질문에 답하기 때문이다.

| | 무엇 | 질문 |
|---|---|---|
| `SceneGraphCanvas` | `edges` | 이 게임의 구조가 어떻게 생겼나 |
| `ScreenMapCanvas`(새것) | `scenes[].screens` + `screenTransitions` | 실제로 어떻게 흘렀나 |

`layoutGraph`(`knowledge/knowledgeLayout.ts`)는 이미 결정적이다 — force 기반이 아니라 union-find +
BFS 링 + shelf packing 이다. 하지만 노드가 **점**이라는 것을 전제로 하고(`NODE_RADIUS` 하나), 크기가
제각각인 상자를 놓을 수 없다. 그래서 재사용하지 않고 별도 모듈을 쓴다.

### 서버 계약 (ARTEL-596, orchestration `ContentMapViewDtos.kt`)

- `ContentMapSceneResponse.screens: List<ContentMapScreenResponse>` — QA 런 전에는 **빈 배열이 정상**이다.
- `ContentMapScreenResponse` — `id`, `sceneId`, `name: String?`(표시용, 조인 키가 아니다),
  `discriminator: JsonNode`(서버가 읽지 않고 그대로 옮긴다), `observedCount`, `firstSeenQaRunId`, `image?`.
- `ContentMapResponse.screenTransitions: List<ContentMapScreenTransitionResponse>` — 최상위에 선다.
  `crossesScene` 인 전이는 두 씬에 걸쳐 어느 씬에 넣어도 반쪽이 되기 때문이다.
  `fromScreenId`/`toScreenId` 는 **non-null**, `kind` 는 `action` · `state` · `auto`, `capabilityId` 는
  자동 전이에서 null.
- `edges[].verifiedAt` 이 null 인 것이 곧 커버리지 구멍이다.

## Constraints

### 배치는 결정적이어야 한다

같은 응답을 두 번 그리면 같은 좌표가 나와야 한다. 그래야 두 빌드를 비교할 수 있고 스크린샷이 재현된다.
반복도, 난수도, 시계도 쓰지 않는다. 서버가 준 배열 순서에도 기대지 않는다 — 정렬 키를 데이터에서 뽑는다.

### 안쪽 먼저, 바깥 나중

씬 안의 화면을 격자로 먼저 놓아 컨테이너 크기를 구하고, **그 상자를 노드 크기로 삼아** 바깥을 놓는다.

### 배치는 순수 함수

`screenMapLayout.ts` 에 React 도 DOM 도 시계도 없다. `knowledgeLayout.test.ts` 가 본이다.

### 색만으로 상태를 말하지 않는다

`DESIGN.md`. box shadow 금지. 검증 여부는 실선/점선 + 채운/빈 화살촉 두 채널로 나른다.

### 캔버스는 포인터 전용에 `aria-hidden`

접근성은 ARTEL-598 의 인스펙터가 진다.

## Approach

- [x] **Step 0: Recon** — `contentMap/*`, `knowledge/knowledgeLayout.ts`, `App.css` 의 `cm-*` 블록,
      `PerformanceSection.tsx`(빌드 선택 관용구), `workspace/sections.ts`, orchestration 의 DTO 와 골든 테스트.
- [x] **Step 1: 계약** — `contentMapTypes.ts` 에 `ContentMapScreen` · `ScreenTransition` ·
      `ContentMapSelection` 을 두고 `ContentMapScene.screens` 와 `ContentMapView.screenTransitions` 를 얹는다.
      `contentMapApi.ts` 에 `parseScreen` · `parseScreenTransition`. 기존 파서의 방어 규칙을 따른다:
      식별하지 못할 때만 버리고 나머지는 화면이 감출 줄 아는 값으로 낮춘다.
- [x] **Step 2: 배치** — `screenMapLayout.ts`. 안쪽 격자 → 바깥 layered.
- [x] **Step 3: 캔버스** — `ScreenMapCanvas.tsx` + `ScreenMapLegend.tsx` + `App.css` 의 `sm-*` 블록.
- [x] **Step 4: 섹션** — `ContentMapSection.tsx`, `App.tsx` route, `sections.ts`, `ProjectNav.tsx` 아이콘,
      `i18n/messages/projects.ts` 의 `nav`, `i18n/messages/contentMap.ts` 의 `section` · `screenMap`.
- [x] **Step 5: Tests** — `screenMapLayout.test.ts`, `contentMapApi.test.ts` 확장.

## Layout

### 안쪽 — 씬 하나의 화면들

화면을 `screenSortKey` 로 정렬한 뒤 `ceil(sqrt(n))` 열 격자에 놓는다. 정렬 키는 표시용 이름이 아니라
`id` 다(숫자면 숫자로, 아니면 문자열로) — `name` 은 nullable 이고 LLM 이 짓는 값이라 정렬 키가 될 수 없다.

컨테이너 상자 = 머리글 높이 + 격자 + 안쪽 여백. 화면이 0 개인 씬도 **상자를 갖는다** — 머리글 아래
빈 몸통이 그대로 남고, 캔버스가 거기에 "관측된 화면 없음" 한 줄을 쓴다.

### 바깥 — 씬 상자들

1. 씬 전이(`edges`)로 씬 수준 인접을 만든다. 목적지 해석은 `buildSceneGraph` 와 같은 순서다:
   `toSceneId` → 이름 → 자리표시.
2. **entry scene** = 들어오는 간선이 없는 첫 씬. 없으면(전부 순환) 입력 순서의 첫 씬.
3. entry 에서 BFS 로 layer 를 매긴다. 못 닿은 씬은 입력 순서로 다시 root 를 잡아 뒤에 잇는다.
4. layer 안의 순서는 **이미 놓인 선행 씬들의 위치 평균(barycenter)**, 동점이면 입력 순서. 한 번만 돈다.
5. layer 를 위에서 아래로 쌓고, layer 안은 왼쪽에서 오른쪽으로. 각 layer 를 가로 가운데 정렬한다.

반복이 없으므로 같은 입력은 언제나 같은 좌표다.

### 선

- **씬 간선** — 상자 중심을 잇는 선을 상자 경계에서 자른다. 같은 쌍의 간선 여럿은 부채꼴로 벌린다.
- **화면 전이** — 화면 노드 중심을 잇고 화면 사각형 경계에서 자른다. 같은 방식으로 부채꼴.

## Visual grammar

색을 빼고 읽어도 전부 갈린다.

| 무엇 | 채널 |
|---|---|
| 검증된 씬 전이 | **실선** + 채운 화살촉 |
| 아직 못 가본 씬 전이(`verifiedAt === null`) | **점선** + 속 빈 화살촉 |
| 씬 간선 vs 화면 전이 | 굵기(1.9 vs 1.2)와 화살촉 모양(삼각형 vs 얇은 갈매기) |
| 씬 경계를 넘는 화면 전이 | 선 아래에 배경색 casing 을 깔아 컨테이너 테두리를 **뚫고** 지나가게 한다 |
| 밟은 씬 / 안 밟은 씬 | 컨테이너 테두리 실선 / 점선 |

casing 은 장식이 아니다. 없으면 컨테이너 테두리와 만나는 자리에서 선이 끊긴 것인지 지나간 것인지
읽히지 않는다.

## Selection (for ARTEL-598)

```ts
export type ContentMapSelection =
  | { kind: 'scene'; id: string }
  | { kind: 'screen'; id: string }
  | { kind: 'sceneEdge'; id: string }
  | { kind: 'screenTransition'; id: string }
```

캔버스는 `selection` 과 `onSelect` 만 받는다. 패널은 만들지 않는다.

## Risks

- 이 화면과 기존 `/game-builds/:buildId/content-map` 이 같은 응답을 두 그림으로 그린다. 답하는 질문이
  다르지만 두 번째 화면이 늘어난 것은 사실이라, 섹션에서 그쪽으로 가는 줄을 하나 걸어 둔다.
- 화면이 아주 많은 씬(수십 개)은 컨테이너가 커진다. 격자가 `sqrt` 열이라 폭과 높이가 함께 자라므로
  한쪽으로만 길어지지는 않는다.

## Rollback

이 branch 의 commit 을 revert 한다. 기존 화면은 손대지 않았으므로 되돌려도 남는 것이 없다.
