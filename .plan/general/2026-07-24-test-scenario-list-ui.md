# 2026-07-24 — TestScenario 목록 UI 및 재진입 링크

- Date: 2026-07-24
- GitHub Issue: None (Jira: ARTEL-115)
- Status: Implemented

## Goal

프로젝트 상세의 Test scenarios 패널에 해당 프로젝트의 시나리오 목록을 표시하고,
각 항목에서 기존 라우트 `/projects/:projectId/test-scenarios/:testScenarioId`로
재진입할 수 있게 한다.

## Non-goals

- 백엔드 목록/approve/delete endpoint 구현 (Notion 명세 확정 대기, 별도 이슈)
- 목록 필터(status/priority/createdBy) UI

## Context / Constraints

- 백엔드 목록 endpoint는 구현 중. 확정 DTO:
  `GET /api/projects/{projectId}/test-scenario` →
  `{ items: [{ testScenarioId, projectId, title, createdAt, updatedAt }] }`
  (비참여자는 404)
- 명세가 바뀔 수 있으므로 endpoint 경로와 DTO 파싱은 `scenarioApi.ts` 한 함수에
  격리한다. 파싱은 기존 스타일대로 관대하게(`asString`/`asNumber` fallback).
- endpoint 부재로 인한 404는 빈 목록과 구분해 "서버가 아직 목록을 지원하지
  않는다" 안내로 보여준다.
- 목록 레이아웃은 `GameInstancePanel`의 dense row 패턴을 따른다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `scenarioApi.ts`, `StartScenarioPanel.tsx`,
  `GameInstancePanel.tsx`(row 패턴), `App.css`(list 클래스), Notion 명세 확인
- [x] **Step 1: Implementation**
  - `scenarioTypes.ts`: `TestScenarioSummary` 타입 추가
  - `scenarioApi.ts`: `listTestScenarios(projectId)` 추가 — 경로·파싱 격리
  - `StartScenarioPanel.tsx`: 목록 로딩/오류(404 구분)/빈 목록/목록 상태 렌더,
    각 행을 시나리오 라우트로 링크
  - `App.css`: `.scenario-list` / `.scenario-row` / `.scenario-name` 추가
- [x] **Step 2: Tests** — 단위 테스트 미구성 프로젝트. `npm run lint`,
  `npm run typecheck`, `npm run build` 통과
- [ ] **Step 3: Rollout / Rollback** — 단일 커밋, `git revert`로 롤백 가능.
  백엔드 endpoint가 열리면 UI 변경 없이 데이터가 나타난다.

## Validation

- **Commands to run:** `npm run lint && npm run typecheck && npm run build`
- **Expected output:** 오류 없음. 백엔드 미구현 상태에서는 패널에 안내 문구 표시.

## Risks & Rollback

- **Risks:** 명세 확정 시 경로/DTO 변경 가능 → `listTestScenarios` 한 함수만
  수정하면 되도록 격리. 404 안내 문구가 endpoint 구현 후에도 보이면 오해 소지 →
  구현되면 정상 목록/빈 목록으로 자연 전환됨.
- **Rollback steps:** `git revert <commit>`

## Open Questions

- 명세 수정 결과에 따라 응답 필드가 바뀔 수 있음 (유저가 확정 후 알려주기로 함).
