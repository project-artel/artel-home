# 2026-07-26 — QA 실행 화면 스텝 진행 시각화

- Date: 2026-07-26
- GitHub Issue: None (Jira ARTEL-240에서 로그 접기와 함께 반영)
- Status: Implemented

## Goal

QA Try 화면을 열었을 때 "지금 어디까지 왔고 각 스텝이 어떤 상태인가"를 로그를
읽지 않고도 알 수 있게 한다.

- 시나리오의 모든 스텝을 헤더 아래 가로 스트립으로 보여 준다.
- 스텝마다 통과 / 실패 / 진행 중 / 대기 / 판정 없음을 아이콘 + 텍스트로 구분한다.
- 판정이 난 스텝을 클릭하면 타임라인이 그 판정 로그로 이동하고 그 행을 표시한다.
- 요약(보고 n/전체 N · 통과 · 실패)을 `aria-live="polite"`로 한 번만 알린다.

## Non-goals

- Agent Server / Orchestration 변경. 이번 작업은 홈 UI만 건드린다.
- 스텝별 로그 필터링, 스텝 단위 접기, 스텝 상세 인스펙터.
- QA 실행 목록(`QaTryPanel`)의 진행률 표시.
- 판정 근거 텍스트를 스트립 안에 다시 쓰는 것. 근거는 타임라인 원본 로그에 있고,
  클릭 점프가 그 자리로 데려간다. (Evidence over metrics)

## Context / Constraints

확인한 실제 계약 (artel-agent-server / artel-orchestration-server 코드 기준):

- 스텝 판정은 Agent의 `report_step` 툴이 내는 `STATUS` 프레임 하나다.
  payload = `{status: "COMPLETED"|"FAILED", result: null, step: <1-based int>, message: <근거>}`.
  `app/agents/qa/tools.py:118-135`.
- 종단 프레임은 `result: "PASSED"|"FAILED"` 와
  `summary: {total, passed, failed, steps: [{step, passed, message}]}` 를 싣는다.
  Orchestration이 여기에 `status`(COMPLETED/FAILED/CANCELLED)와 `completedAt`을 덧찍는다.
  `QaAgentInboundRouter.routeStatus`.
- **`STARTED` 스텝 프레임은 아무도 보내지 않는다.** `StepStatus.STARTED`는 선언만 있고
  사용처가 없다.
- **`LOG` / `ACTION` / `CHAT` payload의 `step` 필드도 아무도 채우지 않는다.**
  `app/qa/channel.py`의 모든 호출부가 `step=None`으로 부른다.
  따라서 스텝과 묶인 로그는 판정 프레임뿐이고, "진행 중"은 **보고된 최대 스텝 + 1**로
  추론할 수밖에 없다. 화면은 이 추론을 사실처럼 말하지 않는다.
- `step`은 1-based다. 프롬프트의 `step_number`가 `ScenarioStep.step`이고,
  홈이 `withSequentialSteps`로 1부터 매기는 값과 같다.
- 스텝 제목은 로그에 없다. `qaTry.testScenarioId`로 `getTestScenario`를 따로 읽어야 한다.
  이 읽기가 실패해도 스트립은 번호만으로 동작해야 한다(제목은 장식).
- 로그 API에는 타입 필터도, 오름차순 커서도 없다(`QaTryController.logs`는 `beforeId`/`size`뿐).
  최초 로드는 최신 50건이므로 **진행이 한참 된 실행을 열면 앞쪽 스텝의 판정 프레임이
  아직 안 실려 있을 수 있다.** 이때 "판정 없음"이라고 단정하면 거짓말이 된다.
  → `hasMore`가 남아 있고 종단 `summary`도 없으면 그 스텝은 `unknown`(확인 안 됨)으로 둔다.
  종단 실행은 `summary`가 마지막 로그라 항상 실려 있으므로 정확하다.
- `.agents/docs/DESIGN.md`: 의미 색은 반드시 아이콘/텍스트와 함께. 성공 green,
  실패 coral, 진행/선택 cyan, 대기 muted, 불확실 amber. 라이브 갱신이 레이아웃을
  흔들면 안 된다. 요약만 `aria-live`로 알리고 개별 로그는 알리지 않는다.

## Approach (Checklist)

- [x] **Step 0: Recon** — 완료. 위 계약과 `src/qa/*`, `src/App.css`의 `.qa-*` 확인.
- [x] **Step 1: 파생 로직** `src/qa/qaProgress.ts`
  - `QaStepState = 'passed'|'failed'|'running'|'pending'|'unreported'|'unknown'`
  - `deriveQaProgress({scenarioSteps, logs, status, historyComplete})`
    - 로그를 훑어 per-step `STATUS`(= `step` 있고 `result` 없음)에서 판정 수집.
    - 종단 `summary.steps[]`로 보강(권위 있는 롤업, 점프 대상 id는 per-step 것 유지).
    - 전체 스텝 수 = 시나리오 스텝 수 → 없으면 `summary.total` → 없으면 본 최대 스텝.
    - frontier = 보고된 최대 스텝 + 1. 종단이 아니면 frontier가 `running`.
  - `stepOf(log)`: 어떤 로그든 `payload.step`을 읽는 공용 헬퍼(타임라인 칩과 공유).
- [x] **Step 2: 시나리오 스텝 읽기** `src/qa/useScenarioSteps.ts`
  - `getTestScenario`로 제목만 가져온다. 실패는 무시(번호로 동작).
  - id를 스텝과 함께 담아 둔다. 효과 안에서 동기 `setState`로 비우면
    `react-hooks/set-state-in-effect`에 걸리고 렌더가 한 번 더 돈다.
- [x] **Step 3: 스트립** `src/qa/QaStepStrip.tsx`
  - 헤더 아래 전체 폭. 진행 막대 + 칩 목록 + 요약 텍스트.
  - 판정 있는 칩만 `<button>`(점프), 나머지는 비대화형.
  - 판정 근거는 `.sr-status`로 스크린리더에 노출하고 `title`로 호버 제공.
- [x] **Step 4: 타임라인 점프** `src/qa/QaLogTimeline.tsx`
  - `focusRequest: {logId, token} | null` + `onFocusResolved` 프로프.
  - 대상 행이 있으면 스크롤 + 하이라이트 + `focus({preventScroll:true})`,
    로드된 범위보다 오래된 id면 `requestOlder()` 후 다음 렌더에서 재시도,
    범위 안인데 없으면(접힘) 조용히 해제.
  - 점프하면 `nearLiveEdge`를 내려 자동 추종을 멈춘다.
  - 행 메타에 `Step n` 칩 추가(`stepOf` 사용).
- [x] **Step 5: 배선** `src/qa/QaTryPage.tsx` — 훅은 조기 반환보다 위에 둔다.
- [x] **Step 6: 문자열** `src/i18n/messages/qa.ts` — `steps.*` en/ko.
- [x] **Step 7: 스타일** `src/App.css` — `.qa-steps*`, `.qa-log-row--focused`, `.qa-log-step`.

구현 중 바꾼 것: `STARTING`은 Agent 세션이 아직 없으므로 frontier를 `running`으로
칠하지 않는다. 시작도 안 한 스텝을 "진행 중"이라 부르는 것이 이 화면이 하지 말아야 할
바로 그 거짓말이다.

## Validation

- **Ran:** `npm run lint`, `npm run typecheck`, `npm run build` — 모두 통과, 새 경고 없음.
- **Ran:** `deriveQaProgress` / `stepOf` 동작 확인 17건. 리포지토리에 테스트 러너가 없어
  스크래치패드에서 esbuild로 번들해 node로 실행했다(테스트 프레임워크를 새로 들이는 것은
  이 작업의 범위가 아니다). 확인한 경계:
  - 진행 중 실행: 판정 2건 → `passed, failed, running, pending`, 카운트와 점프 대상 id.
  - 이력 미완료: frontier 뒤의 미판정 스텝이 `unreported`가 아니라 `unknown`.
  - 종단 실행: per-step 프레임이 하나도 안 실려 있어도 `summary`만으로 상태 복원,
    `summary`에 없는 스텝은 `unreported`, 점프 대상은 없음(null).
  - 취소: 도달한 스텝은 판정 유지, 나머지는 `unreported`.
  - 시나리오 읽기 실패: `summary.total`로 개수 대체, 제목은 빈 문자열.
  - `STARTING`: `running` 없음, 전부 `pending`.
  - 깨진 payload(null, `step: 0`, 미지의 status, 다른 타입의 `step`)는 전부 무시.
- **Not run:** 실제 서버를 띄운 화면 확인. 오케스트레이션 서버와 로그인 세션이 필요하고
  이 환경에 없다. 1024px/1440px 레이아웃과 점프 스크롤 동작은 눈으로 확인하지 않았다.
- **남은 수동 확인:**
  - 종단 실행 열기 → 스텝 상태가 `summary`와 일치, 실패 스텝 클릭 시 근거 로그로 이동.
  - 진행 중 실행 → 판정이 스트림으로 올 때마다 칩이 갱신되고 frontier가 한 칸 전진.
  - 오래된 실행에서 앞쪽 스텝 클릭 → `loadOlder`가 대상까지 거슬러 올라가는지.
  - 1024px / 1440px 레이아웃. 칩이 넘치면 가로 스크롤.

## Risks & Rollback

- **Risks**
  - "진행 중"은 관측이 아니라 추론이다. Agent가 스텝을 건너뛰고 보고하면 frontier가
    실제와 어긋난다. → 건너뛴 스텝은 통과/실패로 칠하지 않고 `unreported`로 남긴다.
  - 오래된 실행을 열면 앞쪽 판정이 미로드다. → `unknown` 상태와 기존 "이전 로그 불러오기"로
    드러낸다. 자동 백필은 이번 범위에서 제외(요청 폭주 위험).
  - 점프가 `loadOlder`를 연쇄로 부를 수 있다. → 대상 id가 로드된 최older보다 오래된
    경우에만 당기고, `hasMore`가 끝나면 멈춘다.
- **Rollback steps:** 이 작업은 새 파일 + 기존 3파일 소폭 수정이므로 커밋 단위 `git revert`.

## Open Questions

- Agent Server가 `LOG`/`ACTION`에 `step`을 찍어 주면 "진행 중"이 추론이 아니라 사실이 되고,
  스텝별 로그 묶기까지 가능해진다. 별도 이슈로 올릴지 확인 필요.
- Orchestration `QaTryResponse`에 스텝 판정 롤업을 실어 주면 미로드 문제가 사라진다.
  같이 제안할지 확인 필요.
