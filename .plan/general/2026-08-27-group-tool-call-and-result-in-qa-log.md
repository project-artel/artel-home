# 2026-08-27 — QA 로그를 tool 호출의 나열로 보인다

- Date: 2026-08-27
- GitHub Issue: None (Jira: ARTEL-603, 스토리 ARTEL-615, 에픽 ARTEL-607)
- Status: Draft

## Goal

QA 실행 콘솔의 활동 로그가 "에이전트가 무엇을 불렀나"의 나열로 읽히게 한다.

Agent 가 보내는 `TOOL` 프레임이 한 행이 되고, 짝이 되는 `TOOL_RESULT` 가 그 행 안으로
들어간다. tool 이름이 보이고, 왜 불렀는지(`thought`)가 본문이며, 인자와 결과 본문은 접어
둔다. `ACTION` 과 `ACTION_RESULT` 도 같은 방식으로 한 행이 되지만, 그것은 조작 tool 이
SDK 로 내보낸 요청이라 `Action` 이라는 제 이름으로 남는다.

**처음에 잘못 잡았던 것.** 이 계획의 첫 판은 `ACTION` 의 라벨을 `Tool` 로 바꾸는 것이었다.
`ACTION` 은 tool 전체가 아니다 — QA 에이전트 tool 28개 중 15개만 남기고, 지식 검색이나
스텝 판정처럼 SDK 를 거치지 않는 13개는 흔적이 없다. 진짜 tool 호출 기록은 Agent 가 새로
내야 했고(ARTEL-609), 그것을 받을 자리는 Orchestration 이 열어야 했다(ARTEL-608).

## Non-goals

- 서버 로그 스키마 변경. Home 표시 로직만 바꾼다.
- `LOG` / `GAME_STATE` / `STATUS` / `ERROR` / `CHAT` 라벨 변경.
- 기존 접기 규칙(연속 `GAME_STATE` 접기, 동일 이벤트 반복 접기) 변경.

## Context / Constraints

로그를 잇는 식별자는 Orchestration 이 만든다.

| 로그 | direction | messageId | correlationId |
|---|---|---|---|
| ACTION inbound | `AGENT_TO_ORCHE` | Agent 의 messageId | null |
| ACTION outbound | `ORCHE_TO_SDK` | 그 로그 자신의 id | Agent 의 messageId |
| ACTION_RESULT inbound | `SDK_TO_ORCHE` | ACTION outbound 의 messageId | Agent 의 messageId |
| ACTION_RESULT outbound | `ORCHE_TO_AGENT` | 같음 | 같음 |

따라서 한 tool 호출에 딸린 네 줄은 `messageId`/`correlationId` 값 집합이 서로 겹친다.
이 교집합이 묶음의 근거다.

두 가지가 제약이다.

1. **인접하지 않는다.** `ACTION` 과 그 결과 사이에 `GAME_STATE` 프레임이 여러 개 낀다.
   지금 `collapseRepeats` 는 연속 로그만 본다. 결과를 끌어올리려면 인접 조건을 버려야 한다.
   대신 결과는 항상 호출보다 뒤에 오므로 뒤로만 훑어 시간 역전은 생기지 않는다.
2. **점프 대상이 사라진다.** `ACTION_RESULT` 행이 없어지므로, 그 로그 id 로 들어오는
   `QaLogFocusRequest` 가 아무 요소도 못 찾는다. 숨은 로그 id 를 실제 렌더된 요소로
   돌려주는 지도가 필요하다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `QaLogTimeline.tsx`, `qaTypes.ts`, `QaRunPage.tsx`(`FLOW_TYPES`),
      Orchestration 의 `QaSdkBridgeService.kt` / `QaActionDispatchService.kt` 로 식별자 규칙,
      Agent 의 `runner.py::_log_reasoning` 으로 tool 이름이 어디까지 오는지 확인.
- [x] **Step 1: 묶음 로직을 순수 모듈로 분리** — `src/qa/qaLogGrouping.ts` 신설.
      `QaLogTimeline.tsx` 안에 있던 순수 함수를 옮기고 다음을 더한다.
      - `groupHops` : 연속 hop 을 한 `TimelineEvent` 로 묶는다(기존 로직 분리).
      - `attachToolResults` : 답을 제 호출에 붙이고 스트림에서 뺀다. `RESULT_OF` 로 층을
        가려 tool 의 답이 액션에 붙지 않게 한다.
      - `collapseRepeats` : 남은 이벤트를 기존 규칙대로 행으로 접는다.
      - `hiddenLogTargets` : 렌더되지 않는 로그 id → (펼칠 행 anchor, 스크롤 대상 요소 id).
      - `toolCallOf` / `toolOutputOf` / `toolResultSummary` : 두 층의 payload 읽기.
- [x] **Step 2: 새 로그 종류** — `qaTypes.ts` 의 `QA_LOG_TYPES` 에 `TOOL`, `TOOL_RESULT`.
- [x] **Step 3: 렌더 변경** — `QaLogTimeline.tsx`
      - `TOOL` 은 `Tool`, `ACTION` 은 `Action` 으로 라벨을 나눈다.
      - TOOL 행: 메타 줄에 tool 이름 칩, 본문에 `thought`, `Inspect arguments` 로 나머지 인자.
      - `QaCallResult` 가 두 층의 답을 모두 그린다. 액션은 성패를 세고, tool 은 본문 첫 줄을
        보인다 — 셀 것이 없는 곳에서 성패를 지어내지 않는다.
      - focus 효과가 `hiddenLogTargets` 를 쓴다.
- [x] **Step 4: Flow 탭** — `FLOW_TYPES` 에서 `ACTION` / `ACTION_RESULT` 를 뺀다. tool 행과
      같은 사건을 두 번 말하기 때문이다. Raw 탭은 그대로 들고 있다.
- [x] **Step 5: 스타일** — `.qa-log-tool-result` 계열과 `.qa-log-tool-name`.
- [x] **Step 6: 테스트** — `src/qa/qaLogGrouping.test.ts` (node test runner).

## Validation

- **Commands to run:** `npm test`, `npm run typecheck`, `npm run build`
- **Expected output:** 전부 통과. 146 tests, 0 fail.
- **Lint:** 리포지토리 전체 `npm run lint` 는 작업 트리의 `.worktrees/` 때문에
  `tsconfigRootDir` 후보가 여러 개로 잡혀 파싱 단계에서 통째로 실패한다(기존 상태).
  `npx eslint src/qa` 로 바뀐 자리만 확인했다.
- **Manual:** QA 실행 화면에서 Flow / Raw 탭 각각, tool 행 하나에 결과가 붙는지와
  스텝 타임라인 점프가 여전히 도착하는지 확인.

## Risks & Rollback

- **Risks:**
  - 짝짓기가 잘못되면 다른 tool 호출의 결과가 엉뚱한 행에 붙는다. 식별자 교집합이
    비어 있으면 붙이지 않는 쪽으로 기울여 막는다.
  - 결과가 아직 안 온 호출은 요약이 없다. 이때는 결과 블록 자체를 그리지 않는다.
  - 페이지 경계 — 오래된 로그를 더 불러오기 전에는 호출만 있고 결과가 없거나 그 반대다.
    양쪽 모두 짝 없는 상태로 그려지고, 페이지가 붙으면 다음 렌더에서 묶인다.
  - ARTEL-609 가 배포되기 전에는 `TOOL` 프레임이 오지 않는다. 그때 Flow 탭은 판정과 오류만
    보인다 — 조작 흐름을 봐야 하면 Raw 탭에 그대로 있다.
- **Rollback steps:** `git revert` 한 커밋.

## Open Questions

- 없음.
