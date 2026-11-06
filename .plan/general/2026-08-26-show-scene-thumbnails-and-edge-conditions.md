# 2026-08-26 — Show scene thumbnails and edge conditions

- Date: 2026-08-26
- Jira: ARTEL-504 (umbrella ARTEL-501; orchestration ARTEL-502, SDK ARTEL-503)
- Branch: `feat/frontend-씬-카드에-대표-이미지와-전이-조건을-보인다-ARTEL-504`
- Base: `feat/frontend-씬에-어떤-조작-단계가-있는지-조건까지-보인다-ARTEL-497`, not `develop` — 이 화면의
  조건 트리 렌더러가 그 branch 에서 온다. ARTEL-497 이 머지되면 PR base 를 develop 으로 되돌린다.
- Status: Implemented, typecheck·test·build green, PR not opened

## Goal

Turn Content Map scene nodes into thumbnail cards and make transition conditions visible without
making dense graphs unreadable.

## Non-goals

- Editing thumbnails or transitions.
- Pan and zoom.

## Context / Constraints

The SVG remains pointer-only and aria-hidden; the inspector remains the complete keyboard and
screen-reader equivalent.

## Approach (Checklist)

- [x] **Step 0: Recon** — inspect graph geometry, scene/edge parsing, inspector, and semantic styles.
- [x] **Step 1: Contract/UI** — parse thumbnail and edge condition fields, draw the image inside the node.
- [x] **Step 2: Conditions** — one-line label on the graph, full tree in the inspector.
- [x] **Step 3: Tests** — condition folding; the existing parser and layout suites still pass.
- [ ] **Step 4: Rollout / Rollback** — old responses show placeholders; revert UI fields to roll back.

## 계획에서 바뀐 것 — 노드를 카드로 바꾸지 않았다

원래 Step 1 은 "고정 크기 thumbnail 카드"였다. 노드는 지금 모양(원·사각·마름모)이 씬의 성격을 나르고,
그 모양은 범례와 짝이다. 카드로 바꾸면 배치 기하와 범례를 같이 손봐야 하고, 무엇보다 **이미지가 있는 씬만
카드가 되어** 밟은 씬과 안 밟은 씬의 구분이 이미지 유무로 바뀐다. 그래서 모양은 그대로 두고 그 안을
`clipPath` 로 채웠다. 카드 배치는 필요하면 별도 이슈로 다룬다.

## What landed

- `contentMapTypes.ts` — `SceneThumbnail`(`available`/`unavailable`), `SceneTransition.given`.
- `contentMapApi.ts` — `parseThumbnail`. 모르는 `state` 는 통째로 버린다. 접으면 없는 이미지를 그리거나
  서버가 말하지 않은 실패를 지어낸다.
- `SceneGraphCanvas.tsx` — 노드 모양 안에 이미지를 클립해 채운다. 전이 조건은 선 가운데 한 줄로 얹고,
  전이가 12개를 넘으면 조용히 두었다가 고른 것과 포인터가 얹힌 것만 보인다. hover 는 CSS 로만 한다 —
  React 상태로 들면 포인터가 지나갈 때마다 그래프 전체가 다시 그려진다.
- `conditionSummary.ts` — 조건 트리를 한 줄로 접는다. `either`/`every` 를 같은 말로 잇지 않고,
  `always`/`unknown` 을 섞지 않고, 모르는 `kind` 는 서버가 쓴 이름을 그대로 보인다.
- `SceneGraphInspector.tsx` — 고른 씬의 큰 미리보기(없음 / 못 찍음 / 주소 만료를 세 문장으로 가른다)와
  전이마다 접지 않은 조건 트리.

## Validation

- **Commands run:** `npx tsc -b`, `npm test`, `npm run build`
- **Result:** typecheck 통과, 126 tests 통과(새 `conditionSummary.test.ts` 7건 포함), build 성공.
- **Lint:** `npm run lint` 은 9 errors 를 내지만 이 branch 이전부터 있던 것이다(변경분을 stash 하고
  돌려도 같은 11건). 이 이슈에서 손대지 않는다.
- **Not run:** 1024px·1440px 브라우저 확인. 실제 스캔 이미지가 아직 없어 눈으로 본 것은 손으로 넣은
  데이터뿐이다.

## Risks & Rollback

- **Risks:** 씬이 많은 지도에서 이미지가 그만큼 요청된다. 서명된 주소를 서버가 씬마다 하나씩 주므로
  브라우저가 병렬로 받는다.
- **Residual risk:** 서명 주소의 수명이 스토리지 기본값(5분)이다. 페이지를 오래 열어 두면 이미지가
  깨지고, 그때 화면은 "새로고침하세요"로 받아 낸다. 수명을 늘릴지는 ARTEL-502 의 열린 질문이다.
- **Rollback steps:** 이 branch 의 commit 을 되돌린다. 서버 응답은 그대로 두어도 된다.

## Open Questions

- 노드를 진짜 카드 배치로 바꿀 것인가. 위 "계획에서 바뀐 것" 참고.
