# 2026-11-04 — QA 영상과 로그 탐색 추가

- Date: 2026-11-04
- GitHub Issue: ARTEL-1374
- Status: Implemented, draft PR preparation

## Goal
완료된 QA의 영상과 TC 검증 구간, 해당 시점 로그를 연결하고 raw 로그에 필터와 검색을 추가한다.

## Non-goals
기존 작업 변경, 배포, 데이터 삭제.

## Context / Constraints
origin/develop의 evaluationApi.playback/attempts가 기존 서버 녹화와 실제 TC 시작·종료를 제공한다. 별도 worktree에서 최신 계약을 재사용한다. Hindsight 연결 실패. 지정된 user-copy.md 파일이 없다. 기존 QA 파일에 미커밋 변경이 많으므로 기존 작업을 보존한다.

## Approach (Checklist)
- [x] **Step 0: Recon** 기존 QA, 스트림, 로그 API와 pulse relay 확인.
- [x] **Step 1: Implementation** raw 로그 type/direction/text 필터와 find 이전/다음 이동, 기존 PULSE 파싱 유지와 기본 숨김. 기존 recording API를 재사용하고 실제 경과 시간의 실행 바에 attempt 구간을 표시한다. 영상 gap은 명시하고 raw 로그는 선택 시점 이전 가장 가까운 행으로 이동한다. 오래된 로그가 필요하면 이전 페이지를 순차 로드한다.
- [x] **Step 2: Tests** 필터, 검색, PULSE API 회귀 테스트와 typecheck, lint, build.
- [x] **Step 3: Rollout / Rollback** 배포 없이 로컬 변경. 추가 모듈과 해당 연결만 제거해 되돌릴 수 있다.

## Validation
- **Commands to run:** npm test, npm run typecheck, npm run lint, npm run build.
- 영상 segment 경계·gap·종료와 반복 TC를 확인한다. 100개 초과 attempt와 페이지 밖 과거 시점 로그를 확인한다. 시나리오 전환·재시도 시 재생 상태와 시각을 확인한다. seek와 find는 입력 포커스를 유지하고 재생 중에는 로그 focus를 요청하지 않는다.
- **Expected output:** PULSE 로그를 읽되 기본 목록에는 숨기고, 필터와 find가 payload와 메시지를 검색한다.

## Risks & Rollback
- **Risks:** 과거 로그를 모두 읽기 전 검색 범위가 제한된다. 이전 로그 로드 버튼을 검색 결과가 없어도 유지한다. 영상 보관 만료·저장 중·누락 구간은 기존 API 상태를 따른다.
- **Rollback steps:** 새 모듈과 QA 화면 연결 부분만 제거한다.

## Open Questions
- 해결: evaluationApi.playback/attempts의 timestamp를 사용한다. 시작 시각이 없는 attempt는 정확한 구간을 표시하지 않는다.

## Review
- Fast: 영상 경계·페이지 처리·포커스 검증 추가를 반영했다.
- Medium: 기존 API 재사용과 home 단일 저장소 범위를 유지했다.
- 초기 Heavy NONPASS의 검증·포커스·segment 전환 항목을 반영했다. Heavy와 최종 pair review PASS. 마지막 영상 이후 gap의 잘못된 종료 시각 표시를 수정하고 실제 MP4 회귀를 추가했다.

## Verification Results
- npm test: 1,621 PASS.
- npm run build: PASS. 기존 bundle 크기 경고.
- Chromium fixture: 19 PASS. 합성 API와 로컬 MP4로 전체 QA 화면을 구동했다. 운영 데이터·실제 게임 QA E2E는 미실행.
- 변경 파일 ESLint·diff-check PASS. 전체 lint는 변경하지 않은 파일의 기존 5 errors / 3 warnings.
- 시나리오 변경은 기존 FocusedTry의 tryId key로 상태를 분리한다. 별도 시나리오 전환 브라우저 회귀는 수행하지 않았다.
