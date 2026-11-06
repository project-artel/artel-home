# 2026-11-04 — QA 사용자 질문의 채팅 표시와 답변 연결

- Date: 2026-11-04
- GitHub Issue: None
- Status: Implemented

## Goal
`ask_user` 질문을 QA 채팅에서 읽고 기존 입력창으로 답한다. 답변은 질문 전용 API로 보내 QA를 재개한다.

## Non-goals
agent 질문 정책, 서버 API, 질문 알림 권한은 바꾸지 않는다.

## Context / Constraints
현재 질문 폼은 작업공간 상단에 있고 채팅은 CHAT 로그만 읽는다. 질문 전용 answer API와 일반 messages API는 서로 다르다. 기존 문구와 semantic tokens를 재사용한다. 다른 화면에서의 질문 접근은 유지한다.

## Approach (Checklist)
- [x] **Step 0: Recon** 최신 origin/develop에서 ask_user와 질문 저장/답변 API 확인.
- [x] **Step 1: Implementation** 질문 구독 hook 공유, 선택한 QA의 질문·답변을 채팅에 시간순 표시, 대기 질문이 있으면 입력창을 answer API에 연결. 새 질문은 채팅 탭에 표시. 콘솔 상단 중복 폼 제외. 질문 알림 링크를 해당 QA 콘솔로 연결. 초기 조회/조회 실패 시 전송을 막고 409 후 재조회한다. 버튼과 접근성 이름은 기존 답변 문구를 사용한다.
- [x] **Step 2: Tests** 다른 QA 질문 제외, 질문/답변 복원, 일반 CHAT 중계 제외, 답변 API 선택과 409 전파 테스트 통과. 시나리오 전환은 key remount, 늦은 요청은 generation 검사로 분리했다. hook 경합의 브라우저 검증은 남아 있다.
- [x] **Step 3: Rollout / Rollback** frontend 변경만 배포. 변경 commit을 되돌리면 기존 폼 복원. 실제 배포는 수행하지 않음.

## Validation
- **Commands to run:** focused node tests, npm run typecheck, npm run build, changed-file ESLint; 가능하면 브라우저 렌더 검토.
- **Expected output:** 질문과 답변이 채팅에 표시되고 질문 답변은 전용 API로 전달된다. 다른 QA에 답하지 않는다.
- **Results:** `node --import ./scripts/node-test-hooks.mjs --test "src/qa/**/*.test.ts"` 286개 통과, `npm run typecheck`와 `npm run build` 통과, 변경 파일 ESLint 통과. Vite 기존 bundle 크기 경고가 있다.

## Risks & Rollback
- **Risks:** SSE/주기 갱신과 답변 경쟁, 선택한 QA 전환 시 이전 답변 노출, 다른 탭에서 먼저 답변한 경우 409.
- **Rollback steps:** 이 변경만 되돌린다. 데이터 migration 없음.

## Open Questions
실제 게임 SDK/agent 실행 재개는 확인하지 않았다. 캡처는 로컬 테스트 DB의 별도 QA 실행 120255와 실제 backend API를 사용했다. 게임 영상 연결은 없는 상태다.

## 전체 앱 검증
- 실제 앱 route: /projects/110147/qa-runs/120255?try=120255. 기존 WSL backend와 DB에 로컬 transport proxy로 연결했다. API 응답을 mock하거나 별도 화면을 렌더링하지 않았다.
- 질문 생성은 실제 internal API, 답변은 실제 answer API를 사용했다. 저장된 답변 복원과 변경 사항 탭에서 새 질문 시 채팅 자동 표시를 확인했다.
- 질문 조회를 잠시 지연하고 별도 API로 먼저 답한 뒤 UI에서 재전송하여 실제 409와 최신 상태 갱신을 확인했다.
- desktop 두 테마와 모바일 390×844에서 전체 앱 캡처 7장을 저장했다. 모바일에서 발견한 채팅 내역 높이 1.6px 문제를 최소 채팅 높이 240px과 세로 스크롤로 수정했다. 수정 후 질문 영역 높이는 100.8px이며 가로 overflow가 없다.
- 답변 후 자동 표시한 채팅이 이전 탭으로 돌아가는 문제를 발견하여, 질문의 대기 상태가 아닌 최신 질문 ID로 표시 기준을 유지했다. 회귀 테스트를 추가했다.
- 공통 DESIGN과 콘솔 PR 지시문에 실제 앱 전체 화면 캡처와 분리 렌더링 대체 금지를 명시했다. 기존 분리 preview는 삭제했고 PR에는 첨부하지 않았다.
- 계획 리뷰의 초기 조회 중 전송 차단과 답변 동작 표시, pair-review의 4000자 제한과 모바일 레이아웃 검토를 반영했다.
