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
- **Results:** `node --import ./scripts/node-test-hooks.mjs --test "src/qa/**/*.test.ts"` 265개 통과, `npm run typecheck`와 `npm run build` 통과, 변경 파일 ESLint 통과. Vite 기존 bundle 크기 경고가 있다.

## Risks & Rollback
- **Risks:** SSE/주기 갱신과 답변 경쟁, 선택한 QA 전환 시 이전 답변 노출, 다른 탭에서 먼저 답변한 경우 409.
- **Rollback steps:** 이 변경만 되돌린다. 데이터 migration 없음.

## Open Questions
브라우저는 localhost Vite에 연결할 때 IAB와 Chrome 모두 ERR_CONNECTION_TIMED_OUT이 발생했다. 실제 화면의 두 테마·모바일·키보드 검토와 실제 QA 재개는 미검증이다. 샘플 preview는 .work에만 있고 제품에는 포함하지 않는다.

계획 리뷰에서 초기 조회 중 전송 차단과 답변 동작 표시를 반영했다. pair-review의 4000자 초안 제한 지적을 send와 버튼에 반영했다.
