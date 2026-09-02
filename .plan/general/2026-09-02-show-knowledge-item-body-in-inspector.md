# 2026-09-02 — 그래프에서 고른 항목의 본문을 inspector 에 보인다

- Date: 2026-09-02
- Jira: ARTEL-754 (story ARTEL-752, epic ARTEL-726; blocked by ARTEL-753; blocks nothing)
- Branch: `feat/그래프에서-고른-항목의-본문을-inspector-에-보인다-ARTEL-754`
- Base: `feat/그래프에서-기획서-node-와-part-of-를-구분해-보인다-ARTEL-751` (already merged into this branch)
- Status: Implemented, typecheck·test green, lint unchanged, pair review passed

## Goal

`KnowledgeInspector` 의 `NodeDetail` 이 노드를 고르면 그 노드의 본문(`description`)을 단건
조회 endpoint 로 받아 와 줄바꿈이 살아 있는 상태로 보인다. 받아 오는 동안과 실패했을 때의 상태가
화면에 있고, 실패는 조용히 빈칸으로 두지 않는다. 같은 항목을 다시 고르면 재조회하지 않고, 고른
항목을 바꾸면 이전 요청의 늦은 응답이 새 항목의 본문을 덮지 않는다.

## Non-goals

- 본문 수정 (Jira 의 Non-goals).
- 목록(`kg-item-list`)에 본문 미리보기를 넣는 것 (Jira 의 Non-goals). `KnowledgeNode` 타입은
  그대로 `description` 없이 둔다 — 그래프 목록 응답이 본문을 안 준다는 계약은 그대로다.
- 문서 node 를 위한 새 시각 요소. ARTEL-751 이 이미 그래프·범례에서 문서 node 를 구분해 보이는
  테두리를 그렸다 — 이 작업은 그 결정에 손대지 않는다. inspector 의 "종류" 표기만 재사용한다
  (아래 Step 4).

## Context / Constraints

**서버가 아직 없다.** ARTEL-753 이 만드는 `GET /api/projects/:projectId/knowledge/:knowledgeId`
는 로컬 stack 에 아직 배포되지 않았다. 계약 문서(Jira ARTEL-753/754)를 기준으로 짠다:
- 200: body 에 최소한 `id`, `summary`, `description`.
- 404: `not_found`.
그래서 실물 응답으로 확인할 수 있는 것이 없고, PR 에도 그렇게 적는다.

**기존 코드가 이미 답한 것들.**
- `apiFetch`(`src/auth/authApi.ts`)+`readJson`(`src/projects/projectApi.ts`)이 이미 401 재시도와
  비-2xx 를 `ProjectApiError` 로 던지는 것을 처리한다. 새 endpoint 도 이 둘만 쓰면 404 는 자동으로
  `ProjectApiError`(그 `isNotFound` getter 포함)로 온다 — 이 작업이 따로 상태 코드를 분기할 필요가
  없다.
- `useKnowledgeGraph.ts` 가 "이 상태가 어느 요청에서 왔는가"를 소스 문자열로 지키는 관용구를
  이미 쓰고 있지만, 그건 요청이 하나뿐인 화면을 위한 것이다. 이 작업은 항목마다 결과가 갈리는
  캐시가 필요해서 그 관용구를 그대로 가져오지 않는다 (아래 설계 참고).
- `documentNodeIds(edges)`(`knowledgeTypes.ts`, ARTEL-751)가 이미 "어떤 `PART_OF` edge 의 `to`" 로
  문서 node 를 구조적으로 가려낸다. `KnowledgeGraphCanvas.tsx` 가 이미
  `documentNodeIds(layout.edges.map((placed) => placed.edge))` 로 쓰고 있다 — `NodeDetail` 에서도
  같은 식을 쓴다.
- `.detail-fields dd { white-space: pre-wrap }`(`App.css`)가 이미 이 코드베이스에서 줄바꿈을
  살리는 관용구다. 본문에도 같은 속성을 쓴다.

**캐시와 경합 방지를 어떻게 설계하는가.** "같은 항목 재선택 시 재조회 금지"와 "이전 응답이 새
항목을 덮지 않음" 두 acceptance criteria 를 하나의 자료구조로 만족시킨다: 항목 id 를 key 로 하는
캐시(`Map<id, {status, description, controller}>`, 항목마다 슬롯 하나)를 하나 두고, 각 요청의
응답은 항상 **자신의 id 슬롯에만**
쓴다. 늦게 도착한 응답이 "새 항목의 본문을 덮는" 일 자체가 구조적으로 불가능하다 — 화면이 읽는
슬롯(`cache.get(selectedId)`)과 늦은 응답이 쓰는 슬롯(`cache.get(그때의 id)`)이 다른 슬롯이기
때문이다. 그래서 이 설계는 흔한 "요청 순번을 비교해 최신 것만 반영" 패턴보다 강한 보장을 거의
공짜로 얻는다. 언마운트 때 아직 끝나지 않은 요청은 `AbortController` 로 끊는다(선택을 바꿀 때는
끊지 않는다 — 끊으면 그 id 를 나중에 다시 고를 때 캐시가 "로딩 중"에서 영영 안 벗어난다).

같은 id 를 향한 요청이 겹치는 유일한 경우는 재시도(실패 후 사용자가 다시 시도)뿐이다. 그때는 이전
컨트롤러를 명시적으로 abort 하고 새 컨트롤러로 교체한다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `KnowledgeInspector.tsx`, `knowledgeApi.ts`, `knowledgeTypes.ts`,
      `useKnowledgeGraph.ts`, `knowledgeLabels.ts`, `App.css` 의 `kg-detail-*` 블록,
      `i18n/messages/knowledge.ts`, `.plan/general/2026-09-02-distinguish-document-node-and-part-of.md`
      (ARTEL-751 의 plan, base branch 의 최근 작업)를 읽었다.
- [x] **Step 1: 타입과 파서** — `knowledgeTypes.ts` 에
      `export type KnowledgeItemDetail = { id: string; summary: string; description: string }` 를
      더한다 (계약이 보장하는 세 필드만; 그 이상은 이 화면이 안 쓴다). `knowledgeApi.ts` 에
      `parseKnowledgeItemDetail(data: unknown): KnowledgeItemDetail | null` 을 `parseKnowledgeNode`
      와 같은 관용구로 짠다 — `id` 가 없으면 `null`, 나머지는 `asString` 으로 빈 문자열 기본값.
      `description` 은 줄바꿈을 포함한 문자열을 그대로 통과시킨다(트림·치환 없음) — 그것이 줄바꿈이
      살아야 한다는 acceptance criterion 이 요구하는 전부다.
- [x] **Step 2: 단건 조회** — 같은 파일에
      `getKnowledgeItem(projectId: string, knowledgeId: string, signal?: AbortSignal): Promise<KnowledgeItemDetail>`
      를 더한다. `apiFetch` 로 `GET /api/projects/{projectId}/knowledge/{knowledgeId}` 를 부르고
      `readJson` 으로 파싱한다 — 404 는 `readJson` 이 이미 `ProjectApiError`(status 404)를 던지므로
      따로 분기하지 않는다. `parseKnowledgeItemDetail` 이 `null` 을 돌려주면(계약 위반: `id` 없는
      200) `ProjectApiError(response.status, ..., 'CLIENT_UNREADABLE_RESPONSE')` 를 던진다 —
      `readJson` 자체가 못 읽는 본문에 쓰는 것과 같은 코드. `ProjectApiError` 를 이 파일의 import
      목록(`../projects/projectApi`)에 더한다.
- [x] **Step 3: 캐시 hook** — 새 파일 `src/knowledge/useKnowledgeItemBody.ts`.
      `useKnowledgeItemBody(projectId: string, selectedId: string | null): { entry: KnowledgeItemBodyEntry | null; retry: () => void }`.
      `KnowledgeItemBodyEntry = { status: 'loading' | 'ready' | 'error'; description: string | null }`.

      **이 저장소의 eslint 설정(`eslint-plugin-react-hooks` v7, React Compiler 규칙셋)이 두 가지를
      금지한다는 것을 구현 준비 중 확인했다** — `npm run lint` 의 기존 9 개 에러 중 두 개
      (`TestScenarioPage.tsx:62`, `useStepEditor.ts:157`)가 바로 이 규칙들이 이미 위반된 사례다:
      1. `react-hooks/set-state-in-effect` — effect 본문 안에서 곧바로(동기적으로) state
         setter 를 부르는 것. `.then`/`.catch` 안에서 부르는 것은 허용된다(비동기 콜백에서 외부
         변화를 반영하는 것은 이 규칙이 원래 의도하는 사용법).
      2. `react-hooks/refs` — 렌더 중에 `ref.current` 를 읽는 것.
      최초 설계(캐시+컨트롤러를 한 `Map` 에 담고 `ref` 에서 직접 읽어 렌더)는 둘 다 걸린다. 그래서
      `useKnowledgeGraph.ts` 가 이미 쓰고 있는 관용구로 다시 짠다 — **"로딩"을 state 로 쓰지 않고
      렌더에서 도출한다.** `useKnowledgeGraph` 의 `status: settled ? state.status : 'loading'` 과
      정확히 같은 발상이다.
      - `const [cache, setCache] = useState(new Map<string, { status: 'ready' | 'error'; description: string | null }>())`
        — **정착된(settled) 결과만** 담는다. `'loading'` 은 이 state 에 한 번도 안 쓰인다.
      - `const inFlightRef = useRef(new Map<string, AbortController>())` — 진행 중인 요청의
        등록부. 렌더에서는 절대 읽지 않는다. effect 안에서 "이 id 를 이미 요청했는가"를 판단하고
        언마운트 때 정리하는 데만 쓴다 — ref 를 effect 안에서 읽고 쓰는 것은 두 규칙 어디에도
        걸리지 않는다.
      - `load(id)` (`useCallback`, deps `[projectId]`): 그 id 의 기존 컨트롤러가 있으면 abort 하고
        (재시도가 진행 중 요청을 대체하는 경우) 새 `AbortController` 를 `inFlightRef` 에 등록한다.
        여기까지는 ref 조작뿐, state setter 호출이 하나도 없다. 이어서 `getKnowledgeItem` 을 부르고,
        **`.then`/`.catch` 안에서만** `setCache((previous) => new Map(previous).set(id, {status, description}))`
        를 부른다(abort 로 인한 실패는 무시). `.finally` 에서 `inFlightRef` 의 해당 컨트롤러가 아직
        자신이면 지운다.
      - `useEffect(() => { if (selectedId !== null && !cache.has(selectedId) && !inFlightRef.current.has(selectedId)) load(selectedId) }, [selectedId, cache, load])`
        — effect 본문에 state setter 호출이 없다(`load` 는 위에서 본 대로 ref 조작 + 비동기 호출
        뿐). `cache.has` 로 "이미 정착된 결과가 있는가"(재조회 금지 규칙), `inFlightRef.current.has`
        로 "이미 요청 중인가"(같은 항목으로 빠르게 되돌아왔을 때 중복 요청 금지)를 같이 본다.
        `selectedId === null` 일 때는 아무 것도 하지 않는다.
      - 언마운트 전용 `useEffect(() => () => { inFlightRef.current.forEach((controller) => controller.abort()); inFlightRef.current.clear() }, [])`.
      - `retry()` (이벤트 핸들러 안에서 불린다 — effect 가 아니므로 여기서 state setter 를 동기
        호출해도 어떤 규칙에도 걸리지 않는다): `selectedId` 가 있으면 `setCache` 로 그 id 의 정착된
        항목을 지워 화면이 즉시 "로딩"으로 도출되게 한 다음 `load(selectedId)` 를 부른다.
      - `entry` 는 렌더에서 `cache.get(selectedId)`(state 읽기 — ref 가 아니라 안전)로 도출한다:
        `selectedId === null` 이면 `null`, `cache` 에 정착된 값이 있으면 그것, 없으면
        `{status: 'loading', description: null}`.

      **경합 방지가 여전히 구조적인 이유**: 늦게 도착한 응답도 `setCache` 로 자기 id 슬롯에만
      쓴다. 화면이 읽는 것은 `cache.get(selectedId)` 뿐이라, 다른 id 로 쓰인 슬롯은 화면에 아무
      영향이 없다 — 요청 순번을 비교할 필요가 없다는 최초 설계의 핵심 통찰은 그대로 남는다.
- [x] **Step 4: inspector 배선** — `KnowledgeInspector.tsx`:
      - 최상위 컴포넌트에서
        `const { entry: bodyEntry, retry: retryBody } = useKnowledgeItemBody(projectId, selection?.kind === 'node' ? selection.id : null)`
        를 부르고 `NodeDetail` 에 `bodyEntry`·`onRetryBody={retryBody}` 로 내려준다.
      - `NodeDetail` 안에서
        `const documentIds = useMemo(() => documentNodeIds(layout.edges.map((placed) => placed.edge)), [layout.edges])`
        로 문서 node 여부(`documentIds.has(node.id)`)를 계산한다 — `KnowledgeGraphCanvas.tsx` 와
        똑같은 식.
      - `kg-detail-kind` 문단의 문구를 `isDocumentNode ? t.knowledge.legend.documentNodeName : t.knowledge.inspector.itemHeading` 로 바꾼다. 새 i18n 키를 만들지 않는다 — `legend.documentNodeName`("Document"/"기획서")이 이미 그래프·범례에서 문서 node 를 부르는 이름이고, inspector 에서 다른 이름을 쓰면 같은 node 가 화면 안에서 두 가지로 불린다.
      - 요약(`kg-detail-summary`) 다음, 태그·출처 등 `dl` 앞에 본문 절을 넣는다:
        `<h3 className="kg-detail-subtitle">{t.knowledge.inspector.bodyLabel}</h3>` 다음 새
        컴포넌트 `<KnowledgeItemBody entry={bodyEntry} onRetry={onRetryBody} />`. 이 컴포넌트는
        새 파일을 만들지 않고 `KnowledgeInspector.tsx` 안에 둔다 — 기존 `NodeDetail`/`EdgeDetail`/
        `AnchorList`/`EndpointButton` 이 전부 이 파일 하나에 있는 것과 같은 관용구다.
      - `KnowledgeItemBody`: `entry === null || status === 'loading'` → `aria-busy="true"` 문단에
        `bodyLoading`. `status === 'error'` → `role="alert"` 블록에 `bodyFailed` 문구와
        `t.knowledge.states.retry` 버튼(`onRetry` 호출). `status === 'ready'` 이고
        `description.trim()` 이 비었으면 `bodyEmpty`. 그 외엔
        `<p className="kg-detail-body">{description}</p>` — 줄바꿈은 CSS 가 살린다(Step 6).
      - **문서 node 를 다르게 보일지 결정**: 본문 렌더링(로딩·실패·줄바꿈 보존)은 문서 node 와
        일반 항목이 완전히 같게 둔다. 다른 것은 "종류" 표기 한 줄뿐이다(위). 이유: 문서 node 의
        본문은 "이 문서가 무엇을 위한 것인지" 산문이고 일반 항목의 본문은 `genre: …` 식 여러 줄
        산문이다 — 둘 다 프리텍스트일 뿐 표시 방식이 갈릴 이유가 없다. 종류 표기만 바꾸면 사용자가
        "이건 항목이 아니라 문서다"를 본문을 읽기 전에 안다. PR 에 이 결정을 그대로 적는다.
- [x] **Step 5: i18n** — `i18n/messages/knowledge.ts` 의 `inspector` 블록(en/ko 양쪽)에 더한다:
      `bodyLabel`("Body"/"본문"), `bodyLoading`("Loading the body…"/"본문을 불러오는 중…"),
      `bodyFailed`("The body could not be loaded."/"본문을 불러오지 못했습니다."),
      `bodyEmpty`("This item has no body."/"본문이 없는 항목입니다."). 재시도 버튼 문구는 새로
      만들지 않고 이미 있는 `t.knowledge.states.retry` 를 재사용한다.
- [x] **Step 6: CSS** — `App.css` 의 `.kg-detail-fields` 근처에 더한다:
      `.kg-detail-body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 20px; color: var(--color-text-primary); }`
      (기존 `.kg-detail-note` 와 같은 크기·줄간격, 다만 배경 없는 일반 프로즈이므로 raised 배경은
      안 쓴다). `.kg-detail-body-error { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); }`
      로 실패 문구와 재시도 버튼의 간격을 잡는다. 로딩 문구는 기존 `.kg-inspector-hint` 를 그대로
      쓴다 — 새 class 불필요.
- [x] **Step 7: Tests** — `knowledgeApi.test.ts` 에 `parseKnowledgeItemDetail` 묶음을 더한다:
      - 계약대로 온 응답이 `id`·`summary`·`description` 을 그대로 읽는다.
      - `description` 이 `"genre: RPG\nplatform: PC"` 처럼 여러 줄이면 그 줄바꿈이 그대로
        보존된다(트림도 치환도 안 됨) — 이 작업의 acceptance criterion 을 직접 겨눈 테스트.
      - `id` 가 없으면 `null`.
      - `summary`·`description` 이 없으면 빈 문자열로 낮아지되 항목 자체는 살아남는다
        (`id` 만 있어도 파싱된다).
      - object 가 아닌 값(`null`, 배열, 문자열)은 `null`.
      `useKnowledgeItemBody.ts` 는 React hook 이라 이 저장소의 테스트 방식(순수 함수를 `node:test`
      로 검증, React 렌더링 테스트 인프라 없음 — `useKnowledgeGraph`/`useScenarioSteps` 도 테스트가
      없다)과 맞지 않는다. `npm run typecheck` 로 타입만 검증하고, PR 의 Risks 에 "hook 자체는
      로컬 stack 에서 항목을 여러 번 선택·재선택해 눈으로 확인해야 한다"고 남긴다.
- [x] **Step 8: Rollout / Rollback** — 서버가 아직 없으므로 이 branch 를 병합해도 로컬 stack 은
      모든 항목에서 `error` 상태(요청이 404 나 연결 실패로 떨어짐)를 보이게 된다 — 조용한 빈칸이
      아니라 실패로 보이므로 회귀는 아니다. ARTEL-753 이 병합되면 자연히 본문이 나온다. 되돌리려면
      `git revert`.

## Validation

- **Commands run:** `npm ci`(절대 경로 `/home/yunseong/.nvm/versions/node/v24.18.0/bin/npm` —
  bare `npm` 은 셸의 nvm shim 이 깨져 있어 `_load_nvm: command not found` 로 실패한다),
  `npm run typecheck`, `npm run test`, `npm run lint`.
- **Result:** `npm ci` — 156 packages, clean. `npm run typecheck` — exit 0, 에러 없음.
  `npm run test` — 271 tests, 271 pass, 0 fail(기존 266 + 새 `parseKnowledgeItemDetail` 5건).
  `npm run lint` — 처음엔 `useKnowledgeItemBody.ts` 의 언마운트 cleanup 이
  `react-hooks/exhaustive-deps`("ref 값이 클린업이 도는 시점엔 바뀌어 있을 수 있다") 경고를 하나
  새로 냈다 — `inFlightRef.current` 를 effect 본문에서 지역 변수로 붙잡아 클린업에 넘기도록 고친
  뒤 재실행하니 9 errors·2 warnings, 이 branch 이전과 정확히 같은 개수. pair review critic 이
  실제 파일 목록으로 검산했다 — 아홉 개는 `testRuns/RunListPanel.tsx`, `testRuns/RunNameCrumb.tsx`,
  `testRuns/RunMapPage.tsx`, `testScenarios/TestScenarioPage.tsx`, `testScenarios/useStepEditor.ts`,
  `testCases/TestCaseModal.tsx`, `testCases/TestCaseSpecModal.tsx`, `streaming/GameStreamView.tsx`,
  `i18n/messages/scenarios.ts` — 전부 이 작업이 건드리지 않은 파일들이다(초안에는 이 중 다섯 개만
  적어 목록이 부정확했다 — 개수·범위 주장 자체는 맞았다).
- **Manual:** 서버가 배포되지 않아 실물 확인 불가 — PR 에 각 상태(loading/ready/error/empty,
  일반 항목/문서 node)를 정확히 글로 적고 캡처가 없는 이유를 명시한다.

## Risks & Rollback

- **Risks:**
  - 계약 문서 밖의 필드나 다른 오류 모양(예: `not_found` 코드 문자열 자체)을 화면이 안 쓴다 —
    지금은 성공/실패만 가른다. ARTEL-753 이 실제로 배포되면 오류 메시지를 더 구체화할지 다시 본다.
  - `useKnowledgeItemBody` 는 React 렌더링 테스트가 없어 캐시·경합 로직이 코드 리뷰와 수동 확인에만
    의존한다. `KnowledgeInspector`/`NodeDetail` 배선도 로컬 stack 없이 typecheck 로만 검증된다.
  - 문서 node 를 "종류" 표기 한 줄로만 다르게 보이기로 한 결정은 서버가 실제로 문서 node 에
    무엇을 담아 보낼지 모르는 채로 내린 것이다 — 실물을 보면 이 결정을 다시 볼 수 있다.
- **Rollback steps:** `git revert`.

## Open Questions

- ARTEL-753 이 실제로 보낼 오류 모양(특히 404 가 아닌 다른 실패)이 계약에 없다 — 배포되면 확인.

## Plan Review

- **Fast reviewer (PASS):** 모든 acceptance criterion 이 구체적인 단계로 매핑되어 있고, id-keyed
  캐시가 "늦은 응답이 새 항목을 덮는다"를 구조적으로 막는다는 점, abort 를 재시도와 언마운트로
  나눈 점을 긍정. non-blocking 메모 세 개를 반영했다: 언마운트 cleanup 을 의사코드로 구체화(Step
  3), `KnowledgeItemBody` 가 어디 사는지 명시(Step 4 — `KnowledgeInspector.tsx` 안), `selectedId
  === null` 일 때 hook 이 아무 것도 안 한다는 것을 Step 3 에 문장으로 못박음.
- **Medium reviewer (NONPASS → 반영):**
  - should-fix 1: "캐시 맵 + 컨트롤러 맵" 이 두 acceptance criterion(재조회 금지, 경합 방지)을
    필요 이상으로 무거운 자료구조 하나로 합쳤다고 지적하며, "재조회 금지"가 A→B→A 재방문을
    뜻하는지 "같은 선택 유지"만 뜻하는지 명시하라고 요구. **판단: Jira 문구("같은 항목을 다시
    고르면")는 A→B→A 재방문을 가리킨다** — 선택이 안 바뀌면 애초에 effect 가 다시 안 도는 것은
    당연해서 acceptance criterion 으로 적을 이유가 없다. 그래서 영속 캐시 자체는 유지하되, 아래
    should-fix 2·3 으로 그 캐시를 가볍게 했다.
  - should-fix 2·3(반영, 이후 재설계): 처음에는 캐시 맵과 컨트롤러 맵을 하나로 합쳐서 반영했다.
    그런데 구현을 준비하며 이 저장소의 `eslint-plugin-react-hooks` v7 설정이
    `react-hooks/set-state-in-effect`(effect 안에서 state setter 를 동기 호출하는 것)와
    `react-hooks/refs`(렌더 중 `ref.current` 읽기)를 금지한다는 것을 확인했다 — 그 합친 설계는
    "로딩" 상태를 effect 안에서 곧바로 ref 에 쓰고 렌더에서 그 ref 를 직접 읽는 모양이라 둘 다
    걸린다(이 저장소의 기존 lint 9 에러 중 두 개가 정확히 같은 위반의 사례다). 그래서 두 자료구조로
    다시 나눴다: **정착된 결과만 담는 `useState` 캐시**(`ready`/`error` 만, `loading` 은 이 state 에
    한 번도 안 쓰인다)와 **진행 중 요청만 담는 `useRef` 등록부**(렌더에서 절대 안 읽는다). "로딩"은
    `useKnowledgeGraph.ts` 가 이미 쓰는 것과 같은 방식으로 렌더에서 도출한다
    (`cache.get(selectedId) ?? {status:'loading', ...}`). should-fix 2 가 겨눴던 "두 맵이 손으로
    맞추다 어긋나는" 위험은 여전히 없다 — 이번엔 두 자료구조가 같은 슬롯을 다르게 표현하는 게
    아니라, "정착된 것"과 "진행 중인 것"이라는 서로 겹치지 않는 두 사실을 각자 들고 있어서다.
    should-fix 3 이 겨눴던 "무관한 리렌더"도 사라졌다 — `setCache` 는 `.then`/`.catch` 안에서만
    불리고, 그 결과를 실제로 보고 있는 컴포넌트만 `cache.get(selectedId)` 로 읽으므로 별도의
    "지금 보고 있는 id인가" 판단이 필요 없다. Step 3 에 최종 설계를 다시 적었다.
  - question(반려): `documentNodeIds` 를 `KnowledgeGraphCanvas.tsx` 와 `NodeDetail` 양쪽에서 각자
    계산하는 중복을 부모(`KnowledgeGraphView`)로 올려 prop 하나로 내리자는 제안. **반려** — 이미
    `KnowledgeLegend.tsx` 도 (다른 입력 모양으로) 독립적으로 계산하고 있어 이 저장소는 "같은 논리를
    보는 곳마다 다시 계산"을 이미 받아들인 관용구이고, `documentNodeIds` 는 순수 함수를 `layout.edges`
    에 대해 `useMemo` 로 한 번 감싸는 것뿐이라 비용이 무시할 만하다. prop 을 하나 더 뚫으면
    `KnowledgeGraphView`·`KnowledgeGraphCanvas`·`KnowledgeInspector` 세 컴포넌트의 시그니처가 모두
    늘어나는데, 그 대가로 없애는 것은 한 줄짜리 `useMemo` 중복뿐이다 — `coding-style.md`의 "DRY 를
    맞추려고만 추상화를 더하지 않는다"에 해당한다고 판단했다.
- **Heavy reviewer (PASS):** 실제 코드(`readJson`, `App.css` 의 `.kg-detail-note` 관용구,
  `KnowledgeGraphPage.tsx` 의 `KnowledgeSection`/`KnowledgeGraphView` 마운트 구조,
  `KnowledgeGraphCanvas.tsx`/`KnowledgeLegend.tsx` 의 독립적인 `documentNodeIds` 계산)를 대조해
  8단계 전부가 acceptance criteria 를 올바르게 구현하는지 확인했고, `documentNodeIds` 반려 사유도
  타당하다고 확인했다. **Step 3 의 최초(맵 하나 + ref 직접 읽기) 설계를 실제로 lint 돌려
  `react-hooks/refs` 위반 2건을 재현**했다고 보고했다 — 정확히 위 should-fix 2·3 재설계에서 이미
  스스로 찾아 고친 문제와 같다. Step 3 를 다시 `useState` 캐시(정착된 값만) + `useRef` 진행 중
  등록부(렌더에서 안 읽음)로 바꾼 뒤라, 이 지적은 이미 반영되어 있다. 남은 비차단 제안 하나
  (재시도가 컨트롤러를 교체한 직후 이전 요청이 막 abort 되기 전에 정착해 버리는 아주 좁은 경합)를
  반영했다 — `load` 의 `.then`/`.catch` 안에서 `inFlightRef.current.get(id) === controller` 를
  먼저 확인하고 아니면 그 응답을 버리도록 Step 3 코드를 고쳤다(`useKnowledgeItemBody.ts` 구현에
  반영, 아래 Validation 참고).

## Pair Review

- **Critic verdict: VERDICT: PASS.** `typecheck`·`test`(271/271)·`lint`(9/2, touched files 무관)를
  독립적으로 다시 돌려 확인했고, `useKnowledgeItemBody.ts` 의 세 경합 시나리오(A→B→A 가 A 진행
  중일 때, 재시도가 진행 중 요청을 대체할 때, 언마운트가 진행 중 요청 도중 일어날 때)를 실제 줄
  번호를 짚어가며 코드로 대조해 전부 안전하다고 확인했다. `KnowledgeInspector.tsx` 의 배선이
  `EdgeDetail`/`AnchorList`/목록을 건드리지 않는다는 것도 확인했다.
- **Must-fix:** 없음.
- **Should-fix(반영):** `KnowledgeItemBodyEntry` 가 평평한 `{status, description: string | null}`
  이라 `status === 'ready'` 인데도 `description` 이 `string | null` 로 남아 `KnowledgeInspector.tsx`
  가 `entry.description ?? ''` 로 방어해야 했다. 구별된 union
  (`{status:'loading';description:null} | {status:'ready';description:string} | {status:'error';description:null}`)
  으로 바꿔 그 방어 코드를 지웠다 — `useKnowledgeItemBody.ts`, `KnowledgeInspector.tsx:325`.
  `npm run typecheck` 재확인, 통과.
- **Should-fix(반려, 이유 명시):** `useKnowledgeItemBody.ts` 의 `inFlightRef = useRef(new Map())`
  가 매 렌더 `new Map()` 을 만들어 버린다는 지적(useState 의 lazy initializer 와 대조됨). **반려**
  — `useRef` 는 `useState` 와 달리 lazy initializer 를 지원하지 않는다. 고치려면
  `useRef<Map<...> | null>(null)` 로 두고 렌더 중 `if (ref.current === null) ref.current = new Map()`
  로 채워야 하는데, 이건 렌더 중 `ref.current` 를 **읽는** 코드라 이 hook 전체가 피해 온
  `react-hooks/refs` 규칙에 오히려 새로 걸릴 위험이 있다. 버려지는 빈 `Map` 하나(마운트 이후로는
  절대 안 만들어짐 — `useRef` 는 첫 번째 인자만 실제로 쓰고 이후 렌더의 인자는 버린다)의 비용이
  그 위험보다 명백히 작다고 판단해 그대로 둔다.
- **PR 에 옮겨 적을 것(반영):** "실패는 재시도 전까지 캐시에 남는다"(A 실패 → B → A 재방문해도
  자동 재시도 없음, retry 버튼만이 탈출구)는 재조회 금지 규칙이 의도한 동작이지만, ARTEL-753 이
  배포되기 전까지는 모든 항목이 이 상태로 보일 것이다 — PR 의 `Risks`에 명시한다. 문서 node "종류"
  표기가 ARTEL-754 acceptance criteria 밖의 추가라는 점도 PR 에 그대로 밝힌다(plan 에 이미 있던
  결정, critic 이 범위상 타당하다고 재확인).
- **받아들이되 안 고친 것:** `summary` 필드를 파싱·테스트하지만 어디서도 렌더하지 않는다(계약이
  보장하는 필드라 유지 비용이 낮다고 판단, YAGNI 로 보되 제거하지 않음).
