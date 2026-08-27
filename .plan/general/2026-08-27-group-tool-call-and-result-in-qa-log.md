# 2026-08-27 — QA 로그에서 tool 호출과 결과를 한 줄로 묶어 보인다

- Date: 2026-08-27
- GitHub Issue: None (Jira: ARTEL-603)
- Status: Draft

## Goal

QA 실행 콘솔의 활동 로그에서 `ACTION` 로그와 그 짝인 `ACTION_RESULT` 로그를 한 행으로
합쳐 보인다. 그 행의 종류 라벨은 `Tool` 로 바꾼다. 결과는 성공/실패 요약 한 줄로 먼저
보이고, 원본 payload 는 접힌 `details` 안에 둔다.

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

- [x] **Step 0: Recon** — `src/qa/QaLogTimeline.tsx`, `src/qa/qaTypes.ts`,
      `src/qa/QaRunPage.tsx`(`FLOW_TYPES`), Orchestration `QaSdkBridgeService.kt`/
      `QaActionDispatchService.kt` 로 식별자 규칙 확인.
- [ ] **Step 1: 묶음 로직을 순수 모듈로 분리** — `src/qa/qaLogGrouping.ts` 신설.
      `QaLogTimeline.tsx` 안에 있던 `collapseRepeats` / `foldedTargets` / `formatPath` 등
      순수 함수를 옮기고, 다음을 더한다.
      - `groupHops` : 연속 hop 을 한 `TimelineEvent` 로 묶는다(기존 로직 분리).
      - `attachToolResults` : `ACTION_RESULT` 이벤트를 앞선 `ACTION` 이벤트에 붙이고
        스트림에서 뺀다. 짝을 못 찾은 결과는 제 행으로 남긴다.
      - `collapseRepeats` : 남은 이벤트를 기존 규칙대로 행으로 접는다.
      - `hiddenLogTargets` : 렌더되지 않는 로그 id → (펼칠 행 anchor, 스크롤 대상 요소 id).
      - `toolResultSummary` : `results` 배열에서 성공/실패 요약 한 줄.
- [ ] **Step 2: 렌더 변경** — `QaLogTimeline.tsx`
      - `TYPE_LABELS.ACTION` 을 `Tool` 로, `ACTION_RESULT` 를 `Tool result` 로.
      - `QaLogRow` 가 붙은 결과를 요약 줄 + `Inspect result` details 로 그린다.
      - `QaFoldedEvent` 도 같은 결과 블록을 그린다.
      - focus 효과가 `hiddenLogTargets` 를 쓰도록 바꾼다.
- [ ] **Step 3: 스타일** — `src/App.css` 에 `.qa-log-tool-result` 계열 추가.
      성공/실패는 `status.success` / `status.critical` 토큰과 텍스트 라벨을 같이 쓴다.
- [ ] **Step 4: 테스트** — `src/qa/qaLogGrouping.test.ts` (node test runner).
      호출/결과 묶음, 사이에 낀 `GAME_STATE`, 짝 없는 결과, 숨은 id 지도, 요약 문구.

## Validation

- **Commands to run:** `npm test`, `npm run typecheck`, `npm run lint`
- **Expected output:** 전부 통과. 새 테스트 파일이 실행 목록에 잡힌다.
- **Manual:** QA 실행 화면에서 Flow / Raw 탭 각각, tool 행 하나에 결과가 붙는지와
  스텝 타임라인 점프가 여전히 도착하는지 확인.

## Risks & Rollback

- **Risks:**
  - 짝짓기가 잘못되면 다른 tool 호출의 결과가 엉뚱한 행에 붙는다. 식별자 교집합이
    비어 있으면 붙이지 않는 쪽으로 기울여 막는다.
  - 결과가 아직 안 온 호출은 요약이 없다. 이때는 결과 블록 자체를 그리지 않는다.
  - 페이지 경계 — 오래된 로그를 더 불러오기 전에는 호출만 있고 결과가 없거나 그 반대다.
    양쪽 모두 짝 없는 상태로 그려지고, 페이지가 붙으면 다음 렌더에서 묶인다.
- **Rollback steps:** `git revert` 한 커밋.

## Open Questions

- 없음.
