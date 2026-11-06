# 2026-07-30 — QA 모델과 reasoning 선택 UI

- Date: 2026-07-30
- Jira: ARTEL-210
- Status: In Progress

## Goal

Orchestration catalog metadata로 모델 capability를 표시하고 호환되는 reasoning control만 제공한다.

## Non-goals

- capability 하드코딩
- 가격 계산
- 자동 추천

## Context / Constraints

- 기존 `QaTryPanel` 실행 폼에 추가한다.
- native select/range/checkbox를 사용해 키보드 접근성을 유지한다.

## Approach (Checklist)
- [x] **Step 0: Recon** QA 생성 API와 panel 확인
- [ ] **Step 1: Implementation** catalog parser/load, metadata, reasoning slider, 생성 payload
- [ ] **Step 2: Tests** typecheck/lint/build와 브라우저 확인
- [ ] **Step 3: Rollout / Rollback** 코드 revert

## Validation
- **Commands to run:** `npm run typecheck`; `npm run lint`; `npm run build`
- **Expected output:** 모두 성공

## Risks & Rollback
- **Risks:** catalog API 계약 drift
- **Rollback steps:** 변경 커밋 revert

## Open Questions
- None
