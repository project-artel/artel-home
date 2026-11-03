# 2026-11-03 — 콘솔 반응형 레이아웃 수정

- Date: 2026-11-03
- GitHub Issue: None
- Jira: ARTEL-1322
- Status: Implemented

## Goal
PR #240 캡처에서 놓친 좁은 화면의 잘림·겹침·접근 불가능한 메뉴와 버튼을 수정한다. 콘솔 공통 shell과 주요 화면도 여러 폭에서 함께 확인한다.

## Non-goals
서버 계약과 TC 판정 상태 변경, 새 디자인 시스템 도입, 새 제품 문구 추가.

## Context / Constraints
기존 overflow 검사는 문서 바깥 가로 넘침만 봐서 내부 잘림과 공간 부족을 놓쳤다. 실제 UI 캡처를 보고 판단하며 표를 강제로 축소하거나 overflow를 숨겨 통과시키지 않는다. 기존 Blueprint Paper tokens와 공유 테마를 유지한다.

## Approach (Checklist)
- [x] **Step 0: Recon**: 현재 화면 캡처, 공통 shell 및 TC 표·sheet·가져오기 구조 확인.
- [x] **Step 1: Implementation**: 모바일 프로젝트 메뉴, TC 표·편집·가져오기, 테스트 런 제목, QA 실행 헤더, QA 히스토리, 사용량, 대시보드 수치, 런 캔버스 대화·도구 모음 수정.
- [x] **Step 2: Tests**: TC 320/360/390/480/640/720/721/768/1024/1280/1440px light/dark. 주요 16개 routes는 320/768/1440px light/dark. 편집 창은 667×375·844×390 가로 화면도 확인. 실제 backend 데이터를 읽어 화면을 조작하고 캡처로 잘림·겹침을 비교했다.
- **Step 3: Rollout / Rollback**: 기존 PR #240에 캡처와 변경을 반영한다. 원격 CI의 최신 결과는 PR checks에서 확인한다. 배포·병합은 별도 작업이며 rollback은 해당 수정 commit revert.

## Validation
`npm run build`, `npm test`, 변경 TSX/CSS lint, 브라우저 너비별 비교 캡처 및 조작 확인. API fixture를 사용한 부분과 실제 stack 검증을 구분한다.

- `npm test`: 164 suites, 1,605 tests 통과.
- `npm run build`, 변경 TSX 4개 ESLint, `git diff --check` 통과.
- 메뉴 선택·뒤로/앞으로 이동·상세 경로 선택값·agent 비활성 메뉴·desktop 접힘 설정 보존 확인.
- TC 표와 가져오기 표의 키보드 가로 스크롤이 오른쪽 끝까지 도달했다. 가져오기에서 TC를 선택하고 붙이기 버튼이 활성화되는 것까지 확인했다.
- 실제 API는 GET/HEAD만 허용하는 로컬 proxy로 읽었다. 저장·붙이기·삭제·QA 실행은 수행하지 않았다.
- 독립 코드 리뷰 PASS. 캡처와 검증 범위는 `../assets/2026-11-03-console-responsive/README.md` 참조.

## Risks & Rollback
공통 레이아웃 수정은 TC 외 화면에도 영향을 준다. navigation과 split pane 및 모달 화면을 함께 검증한다. 서버 데이터에는 변경이 없다.

## Open Questions
없음. 콘솔 전체의 공통 원인과 주요 화면을 대상으로 진행한다.
