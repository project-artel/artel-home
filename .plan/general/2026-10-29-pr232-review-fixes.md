# 2026-10-29 — PR 232 리뷰 오류 3건 수정

- Date: 2026-10-29
- GitHub Issue: None (PR #232)
- Status: Validated

## Goal

선택한 build의 TC 내용으로 편집하고, 오래된 시도의 평가 저장 결과를 표시하며, 알림함 실패 건수에 실제 집계만 사용한다.

## Non-goals

새 API, dependency, 기능 추가는 하지 않는다. #232 기능을 유지하며 #225 디자인만 참고하고 #232의 base를 #225 head로 변경한다. #225 기능 코드를 추가로 복사하지 않는다.

## Context / Constraints

PR #225 head는 이미 #232의 ancestor다. 기존 checkout은 다른 작업으로 수정 중이므로 PR head 49b57a9의 별도 worktree를 사용한다.

## Approach (Checklist)

- [x] **Step 0: Recon** — 미해결 review thread 3개와 데이터 조회·편집·알림 계약 확인.
- [x] **Step 1: Implementation** — 버전 목록으로 대상을 선택하고 Sheet에서 해당 build의 전체 TC를 단건 조회한 후 편집을 허용한다. build별 key로 draft를 초기화한다. 저장 응답은 Editor의 patch 기준에도 즉시 반영하고 historical MAP 응답은 최신 library cache에 넣지 않는다. 저장 후 version·folder 목록을 갱신한다. 평가 저장 시 rows와 linkedAttempt를 즉시 갱신하고 선택한 attempt 단건 재조회와 이전 요청 취소를 수행한다. 명시적인 selected ID는 바꾸지 않아 다른 TC로 이동한 경우에도 선택을 보존한다. 알림함은 casesFailed가 있을 때만 실패 pill 표시.
- [x] **Step 2: Tests** — 이전 build·로딩·비교 전용 TC, 오래된 직접 링크·추가 페이지 시도 저장 및 선택 전환, 실패 0·null·누락을 회귀 검증.
- [ ] **Step 3: Rollout / Rollback** — 범위 확정 후 해당 PR branch에 일반 commit으로 반영. force push와 merge는 하지 않는다.

## Validation

- **Commands to run:** npm test, npm run build, 변경 파일 eslint, git diff --check.
- **Expected output:** 회귀 테스트 통과, typecheck·build와 변경 파일 lint 통과. 화면 fixture 검증은 실제 게임 QA와 구분한다.

## Risks & Rollback

- **Risks:** version loading 중 최신 내용을 fallback하면 다른 build에 저장될 수 있다. 이전 attempt의 비동기 응답이 현재 선택을 덮지 않도록 취소한다.
- **Rollback steps:** 수정 commit을 revert한다.

## Open Questions

- 없음. 사용자가 #232 기능 유지, #225 디자인만 참고로 확정했다.
