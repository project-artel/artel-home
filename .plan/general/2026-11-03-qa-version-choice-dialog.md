# 2026-11-03 — QA 실행 전 TC 버전 선택 모달 추가

- Date: 2026-11-03
- GitHub Issue: None
- Jira: ARTEL-1325
- Status: Implemented, draft PR 준비

## Goal
현재 게임 버전에 없는 실행 대상 TC가 있으면 판정 건너뛰기와 버전 추가 후 실행을 모달에서 선택한다. 추가 후 실행을 primary 버튼과 첫 focus로 강조한다.

## Non-goals
서버 API/schema 변경, 기존 TC 버전의 판정 변경, 운영 배포.

## Context / Constraints
origin/develop에서 독립 worktree를 만들고 이번 변경만 적용했다. 기존 cases-outside-build, includeGenerated 버전 추가 API, versionCaseBuildName을 재사용하며 질문 알림과 통합 고급 설정을 유지한다. 원래 작업 트리의 다른 미커밋 변경은 포함하지 않는다.

## Approach (Checklist)
- [x] **Step 0: Recon**: 실행 전 조회, 버전 추가, TC 판정 저장 및 기존 UI 경로 확인.
- [x] **Step 1: Implementation**: 실행 전 재조회와 모달 선택, 추가 완료 확인, 단축키 및 이어받기 선택 유지.
- [x] **Step 2: Tests**: 독립 worktree의 전체 Node 테스트 1,589개, 변경 파일 ESLint, build, 실제 LaunchPanel API mock 브라우저 검증 17개 통과.
- [x] **Step 3: Rollout / Rollback**: console 코드만 변경한다. 되돌릴 때 이미 추가된 TC나 판정은 삭제하지 않는다.

## Validation
- **Commands to run:** npm test, npm run build, 변경 파일 ESLint, 브라우저 fixture.
- **Expected output:** 추가 완료 뒤 QA 시작. 취소 시 추가/실행 없음. 조회·추가 실패, 새 누락 TC, 빌드 변경 시 기존 승인을 사용하지 않음.
- **Results:** 취소/Escape, 기본 Enter, 건너뛰기, 실패/재시도, 단축키, 새 누락 TC, 선택 변경, 이어받기, 중복 실행 방지, 잔존 누락, 501건 분할 추가, 서버 빌드 변경, 알 수 없는 버전 차단, 양쪽 테마와 390/1024/1440px 확인. pair-review PASS.
- **Evidence:** .plan/assets/qa-version-choice-dialog/에 기본·추가 중·실패 화면과 브라우저 결과를 기록했다. API mock을 사용한 컴포넌트 검증이며 실제 SDK/운영 서버 E2E는 수행하지 않았다.
- **Limitations:** 전체 lint는 기존 useCaseListNav, RunListPanel, RunNameCrumb, useStepEditor의 오류 4개로 실패한다. 변경 파일 lint는 통과했다. build에는 기존 bundle size 경고가 있다.

## Risks & Rollback
- **Risks:** 500건 초과 시 여러 추가 요청 사이에서 실패하면 일부만 추가될 수 있다. 미완료 상태에서는 실행을 막고 재시도로 나머지를 추가한다. TC 추가와 QA 시작은 별개 요청이다.
- **Rollback steps:** 이 PR을 revert한다. 이미 추가된 버전 연결과 기존 판정은 유지한다.

## Open Questions
- 없음.
