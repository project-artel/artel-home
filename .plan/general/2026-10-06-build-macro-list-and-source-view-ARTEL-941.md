# 2026-10-06 — 빌드에 등록된 macro 목록과 source 를 읽는 화면

- Date: 2026-10-06
- GitHub Issue: None (Jira: ARTEL-941)
- Status: Implemented. Contract corrected mid-flight against the real server code

## Goal

한 빌드에 등록된 macro 를 사람이 목록으로 보고, 하나를 열어 source 원문을 읽는 화면을
만든다. 지금은 agent 가 쓴 script 를 읽을 자리가 아무 데도 없어서, QA 런을 맡긴 사람이
그것을 고칠 수도 버릴 수도 믿을 수도 없다.

화면이 답하는 질문은 셋이다.

1. 이 빌드에 macro 가 몇 개 있고 각각 무엇인가 — 이름, parameter, 어느 `screen` 에 달렸는지
2. 이 macro 는 실제로 무엇을 하는가 — source 원문, agent 가 쓴 글자 그대로
3. 아직 어디서 쓸지 모르는 macro 는 어느 것인가 — `screen` 과 안 이어진 것

## Non-goals

- 화면에서 macro 를 고치거나 지우는 것. 고치는 길은 agent 의 `edit_macro` 와
  `register_macro` 뿐이다.
- macro 실행 과정을 그리는 것. macro 안쪽 statement 는 전부 timeline 에 오르도록 설계돼
  있고, Replay Studio 의 timeline 이 이미 그것을 그린다.
- agent 에게 macro 를 보여 주는 경로. `macro-scene-context` 와
  `macro-discovery-render` 가 맡는다.
- 서버 변경. endpoint 둘(ARTEL-943)은 명세대로 소비한다. 실제 응답이 명세와 어긋나면
  고치지 않고 보고한다.
- agent 가 macro 를 고쳤을 때 열려 있는 화면이 저절로 따라가는 것. SSE 를 붙이지 않는다.
  새로고침 button 하나와, macro 를 다시 고르면 다시 읽는 동작으로 충분하다.
- 새 npm 패키지. `react`, `react-dom`, `react-router-dom` 만 쓴다.

## Context / Constraints

### API 계약 (ARTEL-943) — 실제 구현으로 확인했다

처음 받은 계약 두 군데가 틀렸고, orchestration 쪽 PR #286 의
`contentmap/dto/MacroViewDtos.kt` 와 `contentmap/controller/ProjectMacroController.kt`
를 직접 읽어 맞췄다. 정본은 이것이다.

```
GET /api/projects/:projectId/game-builds/:gameBuildId/macros
GET /api/projects/:projectId/game-builds/:gameBuildId/macros/:macroId
```

**목록** — `{ "items": [...] }`. 최상위 배열이 아니다. 이 저장소의 목록 응답
관례이고 `GameBuildListResponse` 를 비롯해 여섯이 같다. 이름 오름차순.

```json
{"items": [{
  "id": 7,
  "name": "attack_with_combined_card",
  "parameters": [{"name": "card_a", "type": "string"}, {"name": "repeat", "type": null}],
  "screens": [{"id": 41, "name": "손패", "sceneName": "TurnBattleScene"}],
  "updatedAt": "2026-10-06T05:21:17.775Z"
}]}
```

**상세** — 목록 한 줄에 `source` 하나를 더한 **평평한** 객체다. 래퍼가 없다.
`id` · `name` · `parameters` · `screens` · `updatedAt` · `source`.

- 식별자는 `number` 가 아니라 **`id`** (`Long`) 다. 이 저장소에 프로젝트 단위 번호
  축이 없다 — migration 98개 전부에 `number` 컬럼이 0개다.
- `source` 는 목록에 **key 자체가 없다.** 한 건이 최대 20,000자라 목록에 실으면
  빌드 하나가 수백 KB 가 된다.
- `definition`(실행용 JSON tree)은 양쪽 어디에도 없다.
- `parameters[].type` 은 **nullable** 이다. 이름과 순서는 `macro.parameter_names`
  에서 오지만 타입은 `definition_json` 에만 있어, tree 가 말하지 않으면 `null` 이다.
- `screens[].name` 은 nullable, **`screens[].sceneName` 은 NOT NULL** 이다. 이름이
  없는 `screen` 을 사람이 알아볼 유일한 값이라 화면이 늘 앞에 둔다.
- `parameters` 는 선언 순서를 지킨다.

**404 는 한 가지 뜻이다.** 빌드가 없음 · 경로의 `projectId` 가 그 빌드의 것과 다름 ·
그 macro 가 이 빌드에 없음, 셋을 서버가 일부러 가르지 않는다. id 를 훑어 남의 빌드
내용을 알아내는 것을 막기 위해서다. 화면도 가르지 않는다.

**macro 가 없는 빌드는 404 가 아니라 `{"items": []}` 다.** 지도가 아예 없는 빌드도
같다. 빈 상태와 없음은 다른 화면이고, 그 분기가 `MacroReport` 에 그대로 있다.

계약은 `macroTypes.ts` 와 `macroApi.ts` 두 파일에만 산다. 더 어긋나면 그 둘만
고치면 된다 — 화면 쪽에는 계약이 한 조각도 새어 있지 않다.

### 목록과 상세를 나눈 것이 설계다

`src/knowledge/*` 가 같은 모양이다 — `knowledge-graph` 목록이 `description` 을
일부러 빼고, `useKnowledgeItemBody` 가 선택된 항목 하나만 단건 조회한다
(ARTEL-753/754).

**단, 그 hook 의 캐시는 가져오지 않는다.** `useKnowledgeItemBody` 는 106줄이고 그
대부분이 한 상황을 위한 것이다 — 사용자가 그래프 node 수십 개를 빠르게 옮겨 다닐 때
늦게 온 A 의 응답이 B 를 덮지 않게 하는 것. 여기에는 그 상황이 없고, 더 중요하게는
**캐시가 틀린 답을 준다.** `source` 는 변한다. agent 가 macro 를 다시 쓰기 때문이다.
화면이 떠 있는 동안 비우지 않는 캐시는 이미 고쳐 쓴 macro 의 옛 `source` 를 계속
보여 준다. knowledge 항목의 본문은 열려 있는 화면 밑에서 다시 쓰이지 않으므로
그쪽에는 없던 문제다.

그래서 `useMacroSource` 는 `useKnowledgeGraph` 의 token 관용구를 따른다 — effect 당
`AbortController` 하나, 로딩은 `state.source !== source` 로 도출, token 은
`${projectId}/${gameBuildId}/${macroId}#${reloadToken}`. **token 에 `gameBuildId` 가
들어간다** — knowledge 쪽 hook 은 `projectId` 로만 키를 잡는데, 그대로 베끼면 빌드가
바뀌어도 같은 id 를 다시 읽지 않는 구멍이 따라온다.

### 저장소 제약

- `.agents/docs/DESIGN.md`: semantic token 만, TSX 에 raw hex 금지, box shadow 금지,
  색만으로 뜻을 전하지 않기, loading·empty·error 상태를 전부 정의, 키보드 접근.
- **mono 글꼴에서 DESIGN.md 를 의도적으로 벗어난다.** 그 문서는 `IBM Plex Mono` 를
  "timestamps, IDs, logs, and input events" 에만 쓰라고 적었고, macro `source` 도
  parameter 서명도 그 넷 중 어느 것도 아니다. 그런데 이슈의 acceptance criteria 가
  등폭을 못박는다 — 들여쓰기가 문법의 일부라 비례 글꼴로는 읽을 수 없는 글이 된다.
  `CLAUDE.md` 가 "unless the task explicitly requires otherwise" 라고 둔 자리가 이것이다.
  PR 본문에 벗어났다는 사실을 적어, 나중 리뷰어가 못 보고 지나친 위반으로 읽지 않게 한다.
- 파싱은 `src/projects/projectApi.ts` 의 `asRecord` / `asString` / `asNullableString` /
  `readJson` 어휘를 쓴다. 관대하게 읽는다 — 필드 하나가 비었다고 전체를 버리면 사용자는
  이 화면이 없던 상태로 되돌아간다.
- 주석은 한국어, 코드가 이름 붙인 것(`screen`, `macro`, `source`, `parameter`)은 영어
  그대로 backtick 안에.
- 테스트 러너는 없다. `node --test` 가 `scripts/node-test-hooks.mjs` 를 통해 `.ts` 를
  직접 돈다 (`npm test`).
- **Baseline (2026-10-06):** `npm run typecheck` 통과, `npm test` 471 통과 0 실패,
  `npm run lint` 문제 10개(오류 8, 경고 2) — 전부 기존 것이다. 이 작업은 하나도 늘리지
  않는다.

### 화면 구조

```
┌ Macros ────────────────────────────── [빌드 ▾] [새로고침] ┐
│ 목록 (좌)                     │ 상세 (우)                  │
│ ── screen 에 달린 macro ──    │ 이름 (parameter 서명)      │
│   openShop(slot: int)   [상점]│ screen 뱃지들 / 안 달림 안내│
│   buyItem(id: string)   [상점]│ 마지막 수정                │
│ ── 아직 screen 미정 ──        │ ┌ source ────────────────┐ │
│   resetAll()                  │ │ <pre> 등폭, 줄 그대로   │ │
└───────────────────────────────┴────────────────────────────┘
```

- `.kg-workspace` 와 같은 2단 grid. 1024px 아래에서는 세로로 쌓는다.
- 두 묶음은 각각 `<h3>` 머리글을 단 `<ul>` 이다. **`screen` 에 달린 묶음이 먼저**,
  미정 묶음이 뒤. 빈 묶음은 머리글째 그리지 않는다 — 전부 달려 있으면 "미정" 머리글이
  없고, 전부 미정이면 "달린" 머리글이 없다. 둘 다 없는 경우는 macro 가 하나도 없는
  경우뿐이고 그것은 아래 빈 상태가 맡는다.
- 미정 묶음에는 머리글 밑에 한 줄 설명을 붙인다. "아직 어디서 쓸지 모른다"는 뜻이지
  "아무 데서나 된다"가 아니라는 것을, 사용자가 빈 뱃지 칸에서 혼자 추론하게 두지 않는다.
- 행은 `<button>` 이다. 선택된 행에 `aria-current="true"`. 목록 안에서 화살표 키를
  가로채지 않는다 — `KnowledgeInspector` 의 항목 목록과 같고, tab 순서만으로 닿는다.
- 상세는 `<section aria-labelledby>` 이고, 선택이 없을 때는 "하나를 고르세요" 한 줄.

#### `?build=` 과 `?macro=` 가 서로를 지우지 않게 하는 법

`ContentMapSection.tsx:35,49` 과 `PerformanceSection.tsx:18,32` 은 둘 다
`setSearchParams({ build })` 를 민 객체로 부른다. 그것은 다른 parameter 를 전부 버린다.
빌드 하나만 싣던 동안에는 맞는 동작이었지만 여기서 그대로 베끼면 둘이 서로를 친다 —
macro 를 고르면 `build` 가 날아가고, `build` 가 없으니 기본 빌드를 채우는 effect 가 돌아
`macro` 를 날린다. 선택이 한 렌더도 살아남지 못한다.

그래서 **이 화면이 주소에 쓰는 모든 자리가 기존 parameter 를 보존한다.**
`TrackerLinkPanel.tsx:78` 이 쓰는 관용구 — `const next = new URLSearchParams(searchParams)`
뒤에 `set` 또는 `delete` — 가 이 저장소에 하나뿐인 보존 선례다. 이 빌드 picker 가
그렇게 하는 첫 번째다. 네 자리 전부가 그 관용구를 쓴다. 아래는 목록이지 예외 명단이
아니다 — 주소에 쓰는 자리를 새로 만들면 그것도 보존한다.

- macro 를 고를 때: `next.set('macro', number)`, `build` 는 그대로 둔다.
- 빌드를 바꿀 때: `next.set('build', id)` 와 함께 **`next.delete('macro')`**. 다른
  빌드의 macro 번호는 뜻이 없으므로 일부러 지운다.
- 기본 빌드를 채우는 effect (`ContentMapSection.tsx:33-36` 에 해당하는 자리):
  `next.set('build', id)` 만 하고 **`macro` 는 남긴다.** 민 객체로 베끼면
  `/macros?macro=7` 을 `?build=` 없이 붙여 넣었을 때 mount 하자마자 선택이 조용히
  사라진다.
- 모르는 `?macro=` 를 지울 때: `next.delete('macro')` 만 하고 **`build` 는 남긴다.**

### 상태

| 상태 | 언제 | 무엇을 그리나 |
|---|---|---|
| loading | 목록 첫 읽기 | `panel-empty` + `aria-busy` |
| error | 목록 읽기 실패 | `panel-message` + `role="alert"` + 다시 시도 |
| empty (빌드 없음) | 프로젝트에 빌드가 하나도 없다 | `ContentMapSection` 과 같은 문구 |
| empty (macro 없음) | 빌드는 있고 macro 가 0개 | 이 빌드에 아직 macro 가 없다 + 어떻게 생기는지 |
| idle | 아무 macro 도 안 골랐다 | 상세 칸에 "하나를 고르세요" 한 줄. 요청을 보내지 않는다 |
| source loading / error | 상세 읽기 | 상세 칸 안에서만. 목록은 그대로 둔다 |
| 모르는 `?macro=` | 주소의 번호가 목록에 없다 | 오류가 아니라 **선택 없음**으로 떨어뜨리고, 그 parameter 를 `{ replace: true }` 로 지운다. 목록이 뜬 뒤에만 판정한다 — 아직 읽는 중에 지우면 멀쩡한 주소를 지운다 |

`idle` 이 별도 상태인 이유: `useKnowledgeGraph` 의 토큰 관용구는 `settled =
state.source === source` 로 로딩을 도출하고, `projectId` 가 절대 비지 않아서 effect 가
항상 한 번은 쓴다는 사실에 기대고 있다. `number` 가 `null` 이면 요청이 영영 안 나가고
`settled` 가 false 로 굳어 **영원히 로딩**이 된다. 그래서 `useMacroSource` 는 선택이
없을 때 effect 가 일찍 반환하고 `idle` 을 돌려주며, `MacroDetail` 은 그 값에서
"하나를 고르세요" 를 그린다.

### source 를 어떻게 그리는가

source 는 코드다. 들여쓰기가 문법의 일부라(`if` 몸통) 무너지면 읽을 수 없는 글이 된다.

- `<pre>` + `--font-mono`
- `white-space: pre` — `pre-wrap` 이 아니다. 긴 줄을 임의로 접으면 들여쓰기가 거짓말을
  한다. 대신 `overflow-x: auto` 로 가로 스크롤을 준다.
- `tab-size: 2`
- 스크롤되는 영역이므로 `tabIndex={0}` 과 `role="group"` + `aria-label` 을 준다.
  키보드만 쓰는 사람이 가로로 넘친 source 에 닿을 수 있어야 한다.
- 읽기 전용이다. `<pre>` 는 편집 수단을 주지 않으므로 별도 장치는 필요 없다.

### parameter 서명

`(card_a: string, repeat)` — 괄호로 감싸고 `이름: 타입` 을 `, ` 로 잇는다. **타입이
`null` 인 parameter 는 이름만 쓴다.** `: null` 이나 `: unknown` 을 적으면 서버가 말하지
않은 것을 화면이 지어내는 것이 된다. parameter 가 없으면 `()` — 빈 문자열로 두면 이름
뒤에 아무것도 없어서 "서명을 아직 못 읽었다" 로 보인다.

목록과 상세가 둘 다 쓰므로 `macroTypes.ts` 에 `macroSignature()` 하나를 둔다 —
`qaTypes.ts` 의 `qaRunPath`, `knowledgeTypes.ts` 의 `relationStyle` 과 같은 자리다.

### `screen` 뱃지

`TurnBattleScene · 손패`. **씬 이름을 늘 앞에 둔다** — `screens[].name` 은 nullable
이고 그때 남는 유일한 단서가 NOT NULL 인 `sceneName` 이다. 이름도 없으면
`TurnBattleScene · #41` 로 id 를 붙인다. 같은 씬의 이름 없는 화면이 둘 달린 macro 에서
씬 이름만 두 번 서면 그 둘이 같은 화면인지 다른 화면인지 아무 말도 하지 않는다.

번역하지 않는다. 양쪽 조각 다 서버가 준 고유명사이고 가운뎃점은 어느 언어에서도 같다.
그래서 `macroScreenLabel` 은 `Messages` 를 받지 않는다.

## Approach (Checklist)

- [ ] **Step 0: Recon** — 끝났다. 따를 패턴을 확정했다.
  - `src/contentMap/ContentMapSection.tsx` + `ContentMapPage.tsx` 의
    `ContentMapReport` — 빌드 하나를 `?build=` 로 고르는 rail 섹션과, 그 아래 본문을
    맡는 컴포넌트의 분업. 그대로 따른다.
  - `src/knowledge/useKnowledgeGraph.ts` — `source`-토큰 읽기 hook.
  - `src/knowledge/KnowledgeGraphPage.tsx` · `KnowledgeInspector.tsx` — loading /
    error / empty 세 상태와 목록+인스펙터 2단 배치.
  - `src/knowledge/knowledgeApi.ts` — 관대한 파서의 모양.

- [ ] **Step 1: Implementation** — 새 파일 7개, 기존 파일 5개 수정.
  - `src/macros/macroTypes.ts` — `MacroSummary`, `MacroDetail`, `MacroParameter`,
    `MacroScreen`, `macroSignature()`, `macroScreenLabel()`. 계약이 사는 한 자리.
  - `src/macros/macroApi.ts` — 경로 두 개, 파서, `listBuildMacros` /
    `getBuildMacro`. 추측 목록을 상단 주석에 적는다.
  - `src/macros/useBuildMacros.ts` — 읽기 hook 둘. 목록(`useBuildMacros`)과 선택된
    하나의 source(`useMacroSource`, `idle` 을 포함한 네 상태). 같은 토큰 관용구를 쓰는
    두 hook 이라 한 파일이다.
  - `src/macros/MacroSection.tsx` — rail 섹션(빌드 picker)과 `MacroReport`(목록 읽기,
    `?macro=` 선택, loading·error·empty 상태). `ContentMapSection` / `ContentMapReport`
    와 같은 분업이다.
  - `src/macros/MacroList.tsx` — 두 묶음으로 갈린 목록. 가르기는 여기서
    `useMemo` 안의 `filter` 두 번이다. 별도 모듈로 빼지 않는다 — 한 줄짜리 규칙을
    두 번째 파일에 적으면 "빈 `screens` 가 미정을 뜻한다"는 뜻이 두 곳에 살게 된다.
  - `src/macros/MacroDetail.tsx` — 머리글 + `screen` 목록 + `<pre>` source.
  - `src/i18n/messages/macros.ts` — `macrosEn` / `macrosKo`.
  - 수정: `src/i18n/messages.ts`(등록) · `src/projects/workspace/sections.ts`
    (`macros` 를 `contentMap` 다음에) · `src/i18n/messages/projects.ts`
    (`projects.workspace.nav.macros` 를 `en` 과 `ko` 양쪽에 — `sectionLabel` 이 읽는다) ·
    `ProjectNav.tsx`(아이콘, `ICON_PATHS` 가 `Record<WorkspaceSectionId, …>` 라 빠뜨리면
    typecheck 가 잡는다) · `App.tsx`(route) · `App.css`(`.macro-*`, token 만).

  `macros` 가 `contentMap` 바로 뒤인 이유: macro 는 `screen` 에 달리고 `screen` 은
  content map 이 그리는 것이다. 그 둘을 떼어 놓으면 "어느 화면에 달렸나"를 읽은 사람이
  rail 을 가로질러 가야 한다. `knowledge` 뒤가 아닌 이유도 같다 — macro 는 agent 가
  배운 사실이 아니라 빌드에 등록된 자산이다.

  빌드 picker 는 `ContentMapSection` · `PerformanceSection` 에 이어 **세 번째 사본**이다.
  지금 빼내면 상관없는 파일 둘을 연다. 네 번째가 생기면 그때 빼낸다.

- [ ] **Step 2: Tests**
  - `src/macros/macroApi.test.ts` — 명세대로의 응답을 필드별로 · 봉투 두 가지 ·
    `number` 가 숫자로 와도 문자열로 · `screens` 키 없음 == 빈 배열 · 식별 못 하는 행만
    버리고 나머지는 남기기 · `source` 가 들여쓰기와 줄바꿈 그대로 통과하는지(`if` 몸통이
    있는 원문으로) · `parameters` 순서 보존 · `macroSignature()` 의 세 경우
    (parameter 없음 / 하나 / 여럿).
  - 수동: `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`.

- [ ] **Step 3: Rollout / Rollback** — feature flag 없음. endpoint 가 없는 동안은
  목록 읽기가 실패해 error 상태가 뜬다. 되돌리기는 `git revert` 하나다.

## Validation

- **Commands to run:** `npm run typecheck` · `npm run lint` · `npm test` ·
  `npm run build`
- **Expected output:** typecheck 통과, test 471+신규 전부 통과, lint 문제 10개 그대로
  (늘지 않음), build 성공.
- **Manual:** `npm run dev` 로 띄워 빈 상태와 error 상태를 본다. **endpoint 가 아직
  없으므로 성공 경로(목록·source·두 묶음)는 실제 응답으로 확인할 수 없다.** 파서를
  실제 JSON 으로 덮는 단위 테스트가 그 자리를 메우고, PR 의 Example 에 "이것이
  무엇을 증명하지 않는가"를 적는다.

## Risks & Rollback

- **Risks:**
  - orchestration 쪽 endpoint 둘(ARTEL-943, PR #286)이 아직 머지되지 않았다. 계약은
    그 PR 의 Kotlin DTO 를 읽어 맞췄지만 **실제 응답을 받아 본 적은 없다.** 머지 전에
    모양이 더 움직이면 `macroTypes.ts` 와 `macroApi.ts` 두 파일만 고치면 된다.
  - 성공 경로의 screen capture 가 없다. 로컬에 띄울 스택이 없고, endpoint 가 없으니
    띄운다 해도 채워진 화면은 안 나온다.
  - 더 이상 추측으로 메운 자리는 없다. 처음 받은 계약의 `number` 와 최상위 배열은
    둘 다 틀렸던 것으로 확인돼 고쳤다.
- **Rollback steps:** `git revert`. rail 섹션 하나와 route 하나가 사라질 뿐 다른
  화면에 영향이 없다.

## Rejected feedback

- **"endpoint 가 없는 동안 rail 의 macros 섹션을 비활성으로 둬라" (fast #6).** rail 은
  어떤 섹션도 그 섹션의 읽기가 실패할 수 있다는 이유로 끄지 않는다. `knowledge`,
  `performance`, `contentMap` 전부 섹션 자신이 error 상태를 진다. 여기만 다르게 하면
  rail 이 서버 상태를 아는 척하게 되고, 그 지식은 rail 에 없다.
- **"목록에 검색을 넣어라".** 넣지 않는다. 한 빌드에 macro 가 몇 개까지 쌓이는지 본 적이
  없고, 안 쓰는 입력 칸은 빈 목록을 더 비어 보이게 한다.

## Open Questions

- `screens[]` 항목이 `id` 와 `name` 말고 `sceneName` 도 싣는가. 싣는다면 뱃지가
  "씬 · 화면" 으로 읽혀 훨씬 낫다. 지금은 안 싣는다고 보고 만든다.
