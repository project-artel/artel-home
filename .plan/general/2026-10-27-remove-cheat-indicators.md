# 2026-10-27 — TC와 실행 로그의 cheat 표시 제거

- Date: 2026-10-27
- GitHub Issue: None
- Status: Implemented locally

## Goal
TC와 실행 로그에서 cheat 배지, 사용 개수와 툴팁을 제거한다.

## Non-goals
cheat 실행 기능과 원본 실행 데이터는 변경하지 않는다.

## Context / Constraints
사용자가 cheat 시각화 제거를 요청했다. 기존 작업 중인 변경은 보존한다.

## Approach (Checklist)
- [x] **Step 0: Recon** — QaScenarioSteps, QaLogTimeline의 표시 확인.
- [x] **Step 1: Implementation** — 배지와 전용 스타일 제거.
- [x] **Step 2: Tests** — typecheck 통과, 관련 기존 테스트 29개 통과, diff 확인.
- [x] **Step 3: Rollout / Rollback** — 로컬 변경으로 전달. 제거한 부분만 복구 가능.

## Validation
- **Commands to run:** npm run typecheck, 관련 node 테스트, git diff --check.
- **Expected output:** 통과. TSX에 cheat 표시 참조가 남지 않는다.
- **Results:** typecheck, 기존 테스트 29개, git diff --check 통과. TSX의 cheat 배지 참조 없음. 실제 로그인 화면의 시각 검증과 배포는 수행하지 않음.

## Risks & Rollback
- **Risks:** 기존 변경이 있으므로 전체 파일을 되돌리지 않는다.
- **Rollback steps:** 이번에 제거한 JSX와 스타일만 복구한다.

## Open Questions
없음.
