# 2026-11-03 — 콘솔 Test Case와 QA 용어 통일

- Date: 2026-11-03
- GitHub Issue: None (Jira: ARTEL-1353)
- Status: Draft PR #244 opened; human review pending

## Goal

한국어·영어 콘솔의 Test Case 및 QA 명칭을 통일하고 coding agent 지시문에 정의를 추가한다.

## Non-goals

API·DB·enum·경로·테스트 동작 변경, 다른 로컬 작업 포함, 테스트 런의 Test Suite 변경, 배포·병합.

## Context / Constraints

- origin/develop 기반 독립 worktree 사용.
- 개념은 Test Case, 목록은 Test Cases. 실제 식별자는 기존 프로젝트 번호 TC-000 형식 유지. 순번이나 DB id를 프로젝트 식별 번호로 바꾸지 않는다.
- 단계 기반 / Step-based, Test Case 기반 / Test case-based. ORDERED·FREE 직렬화 값 유지.
- 테스트 내용 / Test description, 단계 / Step, 사전 조건 / Preconditions, 기대 결과 / Expected result, Test Case 검증 상태 / Test case verification status.
- 테스트 커버리지 / Test coverage. 시나리오 포함 여부를 계산하는 기존 의미와 도움말 유지.
- 최근 QA / Recent QA는 최근 실행 목록. QA 실행 기록 / QA run history는 전체 기록. 최근 활동 / Recent activity는 마지막 실행 이후 활동.
- BROKEN은 원본 누락 / Source missing. 게임 기능 삭제나 QA 실패를 뜻한다고 설명하지 않는다.
- 설명·버튼·오류·접근성 문구 및 콘솔 agent 안내의 같은 용어를 함께 정리한다. 코드 식별자·도구 계약·인용 예시는 유지한다.

## Approach (Checklist)
- [x] **Step 0: Recon** — locale, 사용 컴포넌트, 프로젝트 식별자 formatter, agent 지시문 확인.
- [x] **Step 1: Implementation** — locale 문자열과 하드코딩된 사용자 문구 수정. AGENTS.md에 .agents/docs/product-terminology.md 필수 읽기 링크 추가.
- [x] **Step 2: Tests** — typecheck·build 및 1,615개 테스트 통과. 변경 파일 lint 통과. 전체 lint의 기존 오류 5건은 변경하지 않은 파일에만 존재. locale key·보간 구조 및 식별자 formatter 보존 확인. 양쪽 언어·테마·너비의 fixture 기반 렌더링 확인.
- [x] **Step 3: Rollout / Rollback** — develop 대상 [draft PR #244](https://github.com/project-artel/artel-home/pull/244) 생성. assignee·chore label 및 Jira 링크 확인. revert로 복구. 병합·배포 없음.

## Validation
- **Commands to run:** npm run typecheck, npm run lint, npm test, npm run build, git diff --check.
- **Expected output:** 검사 통과, 기존 식별자와 동작 유지, 용어 일관성 및 긴 라벨의 줄바꿈 확인.

## Risks & Rollback
- **Risks:** 긴 Test Case 라벨의 공간 부족, 일반 이름 치환이 식별자·예시를 바꾸는 문제. 문자열 값만 검토하고 UI에서 확인한다.
- **Rollback steps:** 이 변경 commit을 revert한다.

## Open Questions
- 없음. 테스트 런 이름은 유지한다.

## Review and evidence

- FAST REVIEW: PASS, MEDIUM REVIEW: PASS, HEAVY REVIEW: PASS.
- Pair review에서 가져오기 띄어쓰기, 추천 저장 대상, 검색 도움말을 수정한 뒤 VERDICT: PASS.
- [화면 검증과 한계](../assets/console-terminology/README.md).
- Jira ARTEL-1353 검토 중. Draft 해제는 사람이 검토한 뒤 직접 진행한다.
