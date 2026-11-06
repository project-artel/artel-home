# 2026-09-02 — 그래프에서 기획서 node 와 PART_OF 를 구분해 보인다

- Date: 2026-09-02
- Jira: ARTEL-751 (story ARTEL-747, epic ARTEL-726; blocked by ARTEL-748)
- Branch: `feat/그래프에서-기획서-node-와-part-of-를-구분해-보인다-ARTEL-751`
- Base: `origin/develop`
- Status: Implemented, typecheck·test green, lint unchanged, pair review passed

## Goal

지식 그래프 화면이 `PART_OF` 를 알려진 관계로 그리고, 기획서 node 를 항목 node 와 눈으로 구분해
보이고, inspector 의 관계 목록에서 `PART_OF` 의 두 방향을 서로 다른 말로 읽히게 한다.

## Non-goals

- 항목 본문 표시 (별도 작업, ARTEL-754).
- 계층을 트리로 다시 그리는 레이아웃 변경.
- orchestration-server 쪽 변경 (ARTEL-748, 이 branch 의 base 가 아니고 아직 병합되지 않았다).

## Context / Constraints

ARTEL-748 (orchestration-server, 진행 중·미병합)이 기획서를 올릴 때 `source` 가 `DOCS` 인 문서
node 하나와, 그 문서에서 추출된 항목마다 항목 → 문서로 향하는 `PART_OF` edge 를 만든다. 지금 화면은
그 값을 전혀 모른다: `relationStyle` 이 `PART_OF` 를 `UNKNOWN` 으로 떨어뜨려 관계 이름이 날 문자열로
그려지고 범례에도 없으며, 문서 node 는 다른 항목과 같은 점으로 보인다.

**서버가 아직 없다.** 로컬 stack 에 실제 `PART_OF` edge 가 없으므로 계약 문서(ARTEL-747/748/751)를
기준으로 짠다.

**문서 node 를 어떻게 알아보는가.** ARTEL-748 의 계약은 "문서 node 는 `source` 가 `DOCS` 인 knowledge
행"이라고만 말한다. 그러나 `knowledgeTypes.ts` 의 기존 주석은 "`source`: `DOCS` (extracted from an
uploaded document) or `QA`" — **그 문서에서 추출된 모든 항목도 `source` 가 `DOCS` 다.** 따라서
`source === 'DOCS'` 를 그대로 판별식으로 쓰면 문서 node 뿐 아니라 그 문서의 항목 전부가 "문서 node
처럼" 보여, 정확히 이 작업이 막으려는 문제(항목과 문서 node 가 구분 안 됨)를 재현한다.

대신 구조로 판별한다: **어떤 `PART_OF` edge 의 `to` 인 node 가 문서 node 다.** 방향은
"항목에서 문서로"라고 계약이 명시하므로, 이 판별은 ARTEL-748 이 문서 node 에 어떤 `tag`·`description`
을 붙이든 흔들리지 않는다. `source === 'DOCS'` 라는 계약과 모순되지 않는다 — 문서 node 는 그 부분
집합일 뿐이고, 부분집합만으로는 상위집합(문서에서 추출된 모든 항목)과 못 가른다는 것이 요점이다.
**PR 에 이 선택을 확인 요청으로 남긴다.** ARTEL-748 이 병합되며 실제로 다른 판별식(예: 전용 필드)을
정하면 이 함수 하나만 고치면 된다.

`relation` 과 `tag` 는 열린 어휘로 남는다 (`knowledgeTypes.ts` 헤더 주석). `PART_OF` 를
`KNOWN_RELATIONS` 에 더하는 것은 그 열림을 깨지 않는다 — 알려진 값이 하나 늘 뿐, 모르는 값은 여전히
`UNKNOWN` 갈래로 그려진다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `knowledgeTypes.ts`, `knowledgeLabels.ts`, `knowledgeLayout.ts`,
      `KnowledgeGraphCanvas.tsx`, `KnowledgeInspector.tsx`, `KnowledgeLegend.tsx`, `App.css` 의
      `kg-*` 블록, `i18n/messages/knowledge.ts`, Jira ARTEL-747/748/751 을 읽었다.
- [x] **Step 1: 관계 어휘** — `knowledgeTypes.ts` 의 `KNOWN_RELATIONS` 에 `PART_OF` 를 더한다
      (`CONTRADICTS` 앞, 다섯 개의 "보통" 관계 자리). 순서 주석을 갱신한다. 같은 파일에
      `documentNodeIds(edges)` 를 더해 위 판별을 구현하고, 그 이유를 doc comment 로 남긴다.
- [x] **Step 2: 표시 문구** — `i18n/messages/knowledge.ts` 의 `relations` 에 `PART_OF` 키를 en/ko 로
      더한다 (기본/`out` 문구: "Belongs to"/"소속"). `relationShapes.PART_OF` 도 선 모양을 말로
      더한다. 문서 쪽(`in`) 문구는 별도 키 `relations.PART_OF_CONTAINS` ("Contains"/"포함")로 둔다 —
      `Localized<typeof knowledgeEn>` 미러링 관례를 따르는 이름이라 구현자가 임의 모양을 만들 필요가
      없다. `knowledgeLabels.ts` 에 `relationLabelForDirection(t, relation, direction)` 을 더한다 —
      `relationStyle(relation) === 'PART_OF'` 이고 `direction === 'in'` 일 때만
      `t.knowledge.relations.PART_OF_CONTAINS` 를 돌려주고, `direction === 'self'` 를 포함한 그 외
      모든 경우는 기존 `relationLabel(t, relation)` 과 같다 (다른 다섯 관계는 전혀 건드리지 않는다).
- [x] **Step 3: 선 모양** — `App.css` 에 `.kg-edge--PART_OF`/`.kg-arrow--PART_OF` 를 더한다. 기존
      다섯 관계·`UNKNOWN` 과 겹치지 않는 색·`stroke-dasharray` 를 고른다 (구조적 관계이므로 agent
      reasoning/성공/경고/실패 뜻을 가진 토큰은 피하고 중립 ink 톤을 쓴다).
- [x] **Step 4: 문서 node 표시** — `KnowledgeGraphCanvas.tsx` 최상위에서
      `documentNodeIds(layout.edges.map((placed) => placed.edge))` 를 `useMemo` 로 한 번 계산한다
      (`KnowledgeGraphCanvas` 는 `layout` 만 받고 원본 `graph.edges` 는 받지 않으므로, `layout.edges`
      에서 `.edge` 를 뽑아 넘긴다). `layout.nodes` 를 그리는 루프에서 각 `<NodeMark>` 에
      `isDocument={documentNodeIds.has(placed.node.id)}` 를 넘긴다. `NodeMark` 는 이 prop 을 받아
      문서 node 일 때 자기 모양(shape)과 같은 모양의 테두리(ring)를 마크 바깥에 하나 더 그린다 —
      넷째 도형을 새로 가르치는 대신 "이 모양의, 더 크고 테두리진 버전"으로 읽히게 한다. 세 모양
      (원·정사각형·마름모)을 그리는 기존 switch 를 작은 헬퍼로 뽑아 마크와 링 양쪽에 재사용한다.
      `App.css` 에 `.kg-node-document-ring` 을 더한다 (`border.strong`, 선택 시 `action.primary`).
- [x] **Step 5: 범례** — `KnowledgeGraphPage.tsx` 가 `KnowledgeLegend` 에 이미 `edges`/`nodes` 를
      넘기고 있으므로, `KnowledgeLegend.tsx` 안에서 같은 `documentNodeIds(edges)` 로 문서 node 유무를
      계산한다 (`documentNodeIds.size > 0`). 있을 때만 세 번째 그룹을 더해 그 테두리가 무엇인지
      말로 남긴다.
- [x] **Step 6: inspector 방향** — `KnowledgeInspector.tsx` 의 `NodeDetail` 관계 목록에서
      `relationLabel` 대신 `relationLabelForDirection` 을 쓴다. `incidentEdges` 가 이미 주는
      `direction` (`'out' | 'in' | 'self'`) 을 그대로 넘긴다.
- [x] **Step 7: Tests** — `knowledgeTypes.test.ts` 신설: `isKnownRelation('PART_OF')`,
      `documentNodeIds` 가 `PART_OF` edge 의 `to` 만 고르고 다른 관계·역방향은 고르지 않는지.
      `knowledgeLabels.test.ts` 신설: `relationLabelForDirection` 이 `PART_OF` 의 `out`/`in`/`self`
      에서 다른 문자열을 내는지, 다른 관계는 기존과 같은지.
- [x] **Step 8: Rollout / Rollback** — ARTEL-748 이 병합되기 전에는 `PART_OF` edge 가 없으므로
      `documentNodeIds` 는 항상 빈 집합이다: node 는 하나도 링을 얻지 않고, 범례의 세 번째 그룹은
      아예 그려지지 않는다 — 지금 화면과 눈으로 구분되지 않는다. 되돌리려면 이 commit 을 revert 한다.

## Validation

- **Commands run:** `npm ci`, `npm run typecheck`, `npm run test`, `npm run lint`.
- **Result:** `npm ci` — 156 packages, clean. `npm run typecheck` — exit 0, no errors.
  `npm run test` — 266 tests, 266 pass, 0 fail (기존 249 + 새 `knowledgeTypes.test.ts` 7건 +
  `knowledgeLabels.test.ts` 10건). `npm run lint` — 9 errors·2 warnings, 이 branch 이전과 정확히
  같은 개수, 같은 다섯 파일(`RunListPanel.tsx`, `RunNameCrumb.tsx`, `TestScenarioPage.tsx`,
  `useStepEditor.ts`, `RunMapPage.tsx`) — 이 작업이 건드리지 않은 파일들이다.
- **Manual:** 로컬 stack 에 진짜 `PART_OF` edge 가 없어 눈으로 확인 불가 — PR 에 각 화면 상태를
  글로 정확히 적고 캡처가 없는 이유를 명시한다.

## Risks & Rollback

- **Risks:**
  - `documentNodeIds` 의 구조적 판별이 ARTEL-748 이 실제로 내보내는 모양과 다를 수 있다. 특히 문서
    node 가 예외적으로 항목이 0개라 `PART_OF` edge 가 하나도 없는 경우 문서 node 로 판별되지 않는다 —
    항목 node 와 똑같이 그려지지만, 어차피 그 문서에서 나온 항목이 없다는 뜻이므로 사용자가 잃는
    정보는 크지 않다.
  - `PART_OF` 의 선 모양·색 선택은 서버 데이터 없이 고른 것이라 실제 그래프에서 다른 다섯 관계와
    시각적으로 충분히 구분되는지 실물로 확인하지 못했다.
- **Rollback steps:** `git revert`.

## Open Questions

- ARTEL-748 이 문서 node 에 붙일 `tag` 값이 아직 정해지지 않았다. 정해지면 `documentNodeIds` 를
  대체하거나 보강할지 다시 판단한다.

## Plan Review

- **Fast reviewer (NONPASS → 반영):** `KnowledgeGraphCanvas`/`NodeMark`/`KnowledgeLegend` 사이의
  prop 배선이 구체적이지 않았다 — Step 4·5 에 정확한 계산 위치와 전달 경로를 적었다. i18n 키 이름이
  없었다 — Step 2 에 `relations.PART_OF_CONTAINS` 로 못박았다. `relationLabelForDirection` 의
  `self` 갈래가 무엇을 돌려주는지 없었다 — Step 2 에 "기존 `relationLabel` 과 같다"로 명시했다.
  Validation 절의 "화면이 지금과 똑같다"는 문구를 무엇이 안 그려지는지로 구체화했다 (Step 8).
- **Medium reviewer (PASS):** 범위가 적절하다고 확인됨. 두 개의 non-blocking 메모(정확한 i18n 키,
  `layout.edges` 에서 원본 edge 를 뽑아야 하는 배선)는 위 Step 2·4 반영에 이미 접혔다.
- **Rejected feedback:** fast reviewer 가 "항목이 0개인 문서는 `source === 'DOCS'` 로 폴백할지"를
  물었다. 채택하지 않는다 — 그 폴백은 이 판별식이 애초에 피하려는 문제(문서에서 나온 항목도
  `source` 가 `DOCS` 라 구분이 안 됨)를 그대로 되살린다. 항목이 0개인 문서는 이 build 에서
  일반 항목과 같은 모양으로 남는 것을 받아들인다 — ARTEL-748 이 전용 필드를 보내면 그때 고친다.
- **Heavy reviewer:** 세션 quota 오류로 위임한 heavy reviewer 가 응답 없이 죽었다. 재실행 대신
  직접 확인했다 (self-settled) — `KnowledgeGraphCanvas.tsx`, `KnowledgeLayout.ts`,
  `KnowledgeLegend.tsx`, `i18n/messages/knowledge.ts` 를 다시 읽고 Step 2·4·5 의 배선이 실제 코드
  구조(‵layout.edges‵ 가 ‵PlacedEdge<KnowledgeEdge>‵ 를 담고, ‵KnowledgeLegend‵ 가 이미 ‵edges‵ prop
  을 받는 것)와 맞는지 대조했다. 막을 blocker 를 찾지 못했다. HEAVY REVIEW: PASS (self-settled).

## Pair Review

- **Critic verdict:** VERDICT: PASS. 구조적 `documentNodeIds` 판별, `relationLabelForDirection` 의
  `PART_OF`/`in` 만 특별 취급하는 범위, CSS 색·선 간격이 다섯 관계·UNKNOWN 과 겹치지 않는지,
  i18n 키가 en/ko 양쪽에 다 있는지를 직접 코드로 대조해 확인했다고 밝혔다.
- **Should-fix (반영):** `KnowledgeGraphCanvas.tsx` 에서 `classes.push('kg-node--document')` 가
  `App.css` 어디서도 읽히지 않는 죽은 class 였다 — 실제 시각 효과는 별도로 그려지는
  `kg-node-document-ring` 엘리먼트가 전부 지고 있었다. `.kg-node-document-ring` 규칙을
  `.kg-node--document .kg-node-document-ring` 로 묶어 그 class 가 실제로 뭔가를 구동하게 고쳤다
  (`src/App.css`). 재실행한 `npm run typecheck`·`npm run test`(266/266)·`npm run lint`(9/2, 불변)
  모두 그대로 통과했다.
