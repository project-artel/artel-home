# 2026-10-22 — FREE 타임라인의 TC 순서 표시 수정

- Date: 2026-10-22
- GitHub Issue: None
- Status: Locally validated; not deployed

## Goal
FREE 실행 로그를 시간순으로 표시하고 TC 순서에 따른 구간으로 오인하지 않게 한다.

## Non-goals
ORDERED 표시, 서버 실행 순서, 저장된 TC 판정 변경.

## Context / Constraints
origin/develop의 QaLogTimeline은 Flow와 Raw 모두 TC 구간을 만든다. 원래 checkout의 다른 작업은 보존한다. 신규 설명 문구 없이 기존 행 UI를 재사용한다.

## Approach (Checklist)
- [x] **Step 0: Recon** QaRunPage의 executionMode가 타임라인으로 전달되지 않는 문제 확인.
- [x] **Step 1: Implementation** executionMode 전달. FREE는 FlowStep 및 TC 구간 grouping을 생략하고 chronological rows 사용. ordinal step 배지 제거. 명시적 STATUS COMPLETED/FAILED 및 CASE_VERDICT만 실제 TC ID로 표시. FREE Flow 필터에 CASE_VERDICT 포함.
- [x] **Step 2: Tests** FREE Flow/Raw 순서 역전, TC 없는 로그, 미확인 매핑, ORDERED 유지 render regression. typecheck/build 및 화면 확인.
- [x] **Step 3: Rollout / Rollback** 로컬 변경 검증. 배포는 별도. 수정 커밋 revert로 롤백.

## Validation
- **Commands to run:** node --import ./scripts/node-test-hooks.mjs --test src/qa/QaLogTimeline.test.ts; npm run typecheck; npm run build
- **Expected output:** FREE에서 TC section/step ordinal 없음. 명시적 판정에만 TC ID 존재. ORDERED 기존 구간 유지.

## Risks & Rollback
- **Risks:** Flow 필터와 신규 branch의 source 차이를 함께 검증해야 한다. 미로 탐색이나 게임 TC 실행과 무관.
- **Rollback steps:** 이번 변경 커밋만 revert.

## Open Questions
외부 이슈/PR 게시와 운영 배포는 수행하지 않는다.
## Review
FAST의 STATUS/Flow 필터 보완과 HEAVY의 FREE Flow PULSE 제외를 반영했다. HEAVY PASS, pair-review PASS. FREE Flow/Raw, ORDERED, grouping 회귀 36개 및 변경 파일 lint PASS. 실제 컴포넌트 fixture의 밝은/어두운 테마 확인. 전체 로그인 화면 및 운영 배포는 미검증.

Production build (TypeScript + Vite) PASS. 기존 chunk size 경고만 발생. 로컬 변경은 codex/free-qa-timeline에서 관리한다.
