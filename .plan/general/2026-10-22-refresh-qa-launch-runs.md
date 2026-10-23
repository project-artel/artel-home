# 2026-10-22 — QA 실행 화면의 런 목록 재조회 추가

- Date: 2026-10-22
- GitHub Issue: None
- Status: Implemented

## Goal
시나리오 편집 후 QA 화면에 들어오면 서버에서 집계한 최신 개수로 실행 전 점검을 한다.

## Non-goals
서버 집계 SQL, FREE 실행 방식, 버전 경고는 변경하지 않는다.

## Context / Constraints
Workspace가 보관한 런 목록은 시나리오 편집 후 갱신되지 않는다. 서버 목록 응답은 FREE와 ORDERED 모두 집계한다.

## Approach (Checklist)
- [x] **Step 0: Recon** 기존 목록 조회와 실행 전 점검 경로 확인.
- [x] **Step 1: Implementation** QA 진입 시 런 목록을 재조회하고, 응답이 도착한 뒤 실행 화면을 표시한다. 실패 시 기존 오류/재시도 UI를 사용한다. 프로젝트 변경 및 이탈 시 요청을 취소한다.
- [x] **Step 2: Tests** 이전 0개에서 최신 1개로 변경, 실제 0개, 조회 실패 및 재시도, 재진입을 검증한다.
- [x] **Step 3: Rollout / Rollback** 프런트엔드 배포만 필요하며 변경을 되돌리면 복구된다.

## Validation
- **Commands to run:** 관련 node tests, npm run typecheck, npm run lint, npm run build.
- **Expected output:** 테스트와 정적 검사 통과. 이전 Workspace 개수는 실행 전 점검에 사용하지 않는다.

## Risks & Rollback
- **Risks:** 화면 진입마다 목록 조회 1회가 추가된다. 실패를 빈 목록으로 취급하지 않아야 한다.
- **Rollback steps:** QA 진입 조회 변경을 되돌린다.

## Open Questions
- 없음.

## 검증 결과
- ARTEL-1210. plan-review와 pair-review: PASS.
- npm test: 1,454개 통과. typecheck와 build 통과.
- 변경 파일 ESLint 통과. 전체 lint는 기존 파일의 오류가 남아 있다.
- Playwright와 실제 React 화면에서 조회 대기, 이전 0개에서 최신 1개 반영, 재진입 후 0개 차단, 503 실패, 재시도, 프로젝트 변경을 확인했다.
- 화면 캡처는 로컬 API fixture를 사용했다. 운영 런 32와 실제 QA 실행은 검증하지 않았다.
- readJson이 이미 HTTP 실패를 처리하므로 API 구현은 수정하지 않았다.

