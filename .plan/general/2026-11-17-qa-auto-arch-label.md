# 2026-11-17 — QA 실행 설정의 통계 label 자동 생성

- Date: 2026-11-17
- GitHub Issue: None
- Jira: ARTEL-1456
- Status: In Review

## Goal
고급 설정을 바꾼 뒤 이름 입력 없이 QA를 실행한다.

## Non-goals
실행 기록 이름 편집과 통계 API 변경.

## Context / Constraints
통계는 agent_arch로 실행을 묶고 서버는 label을 최대 50자로 받는다.

## Approach (Checklist)
- [x] **Step 0: Recon** 콘솔 실행과 요청 변환 경로 확인
- [x] **Step 1: Implementation** 이름 입력과 점검 제거 및 설정별 label 생성
- [ ] **Step 2: Tests** 실행 버튼, 요청 변환, 이전 설정 복원 테스트
- [ ] **Step 3: Rollout / Rollback** 콘솔 PR 및 CI 확인

## Validation
- **Commands to run:** npm test, npm run lint, npm run build
- **Expected output:** 같은 설정은 같은 label로 전송되고 이름 없이 실행 가능.

## Risks & Rollback
- **Risks:** 이전 수동 label은 새 자동 label과 별도로 집계된다.
- **Rollback steps:** PR 커밋을 revert한다.

## Open Questions
- 없음.
