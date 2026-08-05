# 2026-08-05 — QA 타임라인 게임 상태 로그 접기·펼치기

- Date: 2026-08-05
- GitHub Issue: None (Jira ARTEL-240)
- Status: Implemented

## Goal

QA Try 타임라인에서 GAME_STATE가 차지하는 비중을 줄이면서, 접힌 프레임을 하나도
잃지 않는다.

- 연속된 GAME_STATE를 한 행으로 접는다.
- 접힌 행을 펼치면 프레임별 시각·경로·payload를 각각 읽을 수 있다.
- 스텝 스트립의 점프 대상이 접혀 있으면 그 행을 자동으로 펼친다.

## Non-goals

- SDK 폴링 간격 조정, Orchestration의 프레임당 2줄 기록 축소. 이번 작업은 홈 UI만
  건드린다.
- 로그 타입 필터, 페이지네이션 정책 변경.
- 접힌 프레임 사이의 diff 계산. 원문 payload를 그대로 보여 주는 것까지가 범위다.

## Context / Constraints

확인한 실제 계약:

- SDK는 1초 간격으로 씬을 스캔하고 해시가 바뀌면 GAME_STATE를 보낸다
  (`ArtelManager.cs` `SceneScanIntervalSeconds = 1f`, `PollSceneState`).
- Orchestration은 한 프레임을 두 줄로 남긴다 — `SDK_TO_ORCHE`(수신),
  `ORCHE_TO_AGENT`(중계). `QaSdkBridgeService.routeGameState`.
- 그래서 기존 `collapseRepeats`의 stream 접기 조건(`previous.direction === direction`)이
  한 번도 참이 되지 않았다. 프레임마다 방향이 번갈아 나오므로 접힌 것이 없고,
  1초에 한 행씩 쌓였다.
- 릴레이 hop 병합(`isNextHop`)은 정상 동작했다. 프레임 내부 두 줄은 이미 한 행이다.

제약:

- 접기는 연속된 로그만 대상으로 한다. 시간 순서를 바꾸지 않는다.
- 접힌 로그를 버리지 않는다. 근거는 원본 payload에 있다 (Evidence over metrics).
- 라이브 tail은 계속 프레임을 접어 넣으므로, 펼침 상태의 식별자가 최신 로그를
  따라가면 안 된다.

## Approach (Checklist)

- [x] 행 모델을 `{log, repeats}` → `{events: QaLog[][], path}`로 바꿔 접힌 로그를
      전부 보관한다. `events`의 한 항목 = 한 이벤트와 그 릴레이 hop들.
- [x] stream 타입(GAME_STATE)은 direction을 보지 않고 연속이면 접는다. 경로는
      `withHop`으로 중복 hop을 쌓지 않는다.
- [x] `Show all N events` 버튼(`aria-expanded`)을 `Inspect payload` 옆에 둔다.
      meta 줄에 32px 타겟을 넣으면 접힌 행마다 헤더가 높아진다.
- [x] 펼침 상태는 행의 **가장 오래된** 로그 id로 기억한다(`anchorOf`). 최신 id로
      잡으면 새 프레임이 접힐 때마다 펼침이 풀린다.
- [x] 점프 대상이 접혀 있으면 해당 행을 펼치고 다음 렌더에서 스크롤한다
      (`foldedTargets` 맵). 이전에는 요청을 그냥 버렸다.

## Validation

- `npm run typecheck`
- `npm run lint` (남은 문제는 모두 `src/testScenarios`·`src/testRuns`의 기존 것)
- `npm run build`
- 수동: 실행 중인 QA Try에서 GAME_STATE 행이 하나로 접히는지, 펼쳤을 때 프레임이
  시각 순으로 나오는지, 라이브로 프레임이 늘어도 펼침이 유지되는지, 스텝 클릭이
  접힌 판정 로그까지 데려가는지.

## Risks & Rollback

- 오래 실행된 런은 한 행에 수백 프레임이 접힌다. 펼치면 payload `details`가 그만큼
  렌더된다. 기본이 접힘이고 열람은 명시적 조작이므로 감수한다. 문제가 되면
  펼침 목록에 상한을 둔다.
- `content-visibility: auto`가 걸린 행이 펼침으로 크게 늘어나면 스크롤 앵커가
  튈 수 있다. `contain-intrinsic-size: auto`가 마지막 크기를 기억하므로 두 번째
  진입부터는 안정적이다.
- 롤백: `QaLogTimeline.tsx`와 `App.css`의 해당 커밋만 되돌리면 된다. 서버 계약과
  저장 데이터는 건드리지 않았다.

## Open Questions

- 로그 발생량 자체를 줄일지 여부(SDK 폴링 간격, Orchestration의 프레임당 2줄
  기록). UI 접기로 읽기 문제는 해결되지만 저장량은 그대로다.
