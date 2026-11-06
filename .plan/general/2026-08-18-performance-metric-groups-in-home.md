# 2026-08-18 — 성능 지표군 확장 반영과 실서버 연동

- Date: 2026-08-18
- Jira: ARTEL-436 (엄브렐러 ARTEL-434, 선행 ARTEL-435)
- Status: Implemented

## Goal

1. 확장된 계약(`groups` 봉투, `availability` 3상태, `sampleRatio`, `renderCounters.source`)을 타입과 파서에 반영한다.
2. `useMock` 분기를 걷어내고 실서버에 붙인다.
3. 새 지표군을 화면에 반영하되, **군이 없을 때·모르는 군일 때의 처리는 한 곳에서 정한다**.

## Non-goals

- 화면 신규 제작. ARTEL-379가 이미 만들었다
- **범용 chart engine.** 군 추가에 열려 있는 것과 임의 지표를 그려주는 프레임워크는 다르다
- 기존 QA 런·빌드 패널 재구성
- 서버 (ARTEL-435), SDK (ARTEL-350/351/352)

## 핵심 판단 — 봉투는 엄격, 군 내부는 느슨

ARTEL-379는 파서를 **전부** 엄격하게 만들었고 그 근거가 옳았다. 화면이 회귀 판단을 내리므로
계약에서 벗어난 payload가 그럴듯한 그래프가 되면 안 된다.

그런데 같은 엄격함을 군 내부에 적용하면 **서버가 화면보다 먼저 배포되는 정상 순서에서 배포마다
화면이 깨진다.** 계약의 군 추가 규칙이 "클라이언트는 모르는 군 키를 무시한다"인 이유가 이것이다.

그래서 경계를 하나 긋는다.

- **엄격** — 고정 필드(`runId`, `summary`의 7+개 지표, `series` 봉투, 런 항목)와 `groups` 봉투 자체.
  어긋나면 `malformed`
- **느슨** — 군 이름, 군 내부 필드, 잎의 깊이. 모르면 무시하거나 그대로 통과

예외가 하나 있다. 군 안의 `availability`는 검사한다. 그것이 군 자신의 봉투이고, 못 알아본 값이
조용히 "보여줄 것 없음"이 되면 *측정했는데 비어 있음*과 구분되지 않는다. 다만 던지지 않고
`NOT_REPORTED`로 떨군다 — 나중에 네 번째 상태가 생겨도 페이지가 죽지 않아야 한다.

`MEASURED`가 아닌 군의 `metrics`는 버린다. 안 그러면 카운터를 못 읽은 군이 읽은 것처럼 그려진다.

## 군 표시 — 한 곳에서 정하는 것과 각자 두는 것

`MetricGroupPanel.tsx` 하나가 **"값이 없다, 이유는 이것이다"**를 답한다. 이 답을 패널마다
흩으면 `UNSUPPORTED`(재려다 못 쟀음)와 `NOT_REPORTED`(이 SDK가 이 군을 모름)가 결국 같은
빈칸으로 그려진다.

군마다의 읽는 법은 그대로 각자 둔다 — draw call 수와 GC 정지는 같은 것이 아니다. 이름표와 잎
라벨은 i18n 사전에서 오고, **사전에 없는 군·잎은 와이어 이름 그대로 렌더**된다. 이것이
"군 추가에 열려 있음"이고, 임의 지표를 시계열로 그려주는 엔진을 만드는 것과는 다르다.

빌드 추세에서 `renderCounters`는 **선으로 잇지 않고 런마다 출처와 함께 표에 적는다.** Editor
`UnityStats`와 Standalone `ProfilerRecorder`는 이름이 같아도 다른 값이라, 한 선으로 이으면 애초에
같은 측정이 아닌 둘을 비교하게 된다. 표에 출처를 적으면 비교 불가라는 사실이 보인다.

## mock 처리

서버(ARTEL-378 PR #121)가 `develop`에 머지됐으므로 `useMock` 분기와 `VITE_PERFORMANCE_API`를
걷어낸다. `performanceMock.ts`는 지우지 않고 `performanceFixtures.ts`로 옮겨 **테스트 전용
경계 목록**으로 남긴다. 무샘플·process 없음과 실제 0·중간 null 구간·null budget·낮은 coverage·
높은 discharging·runs 0/1개는 서버가 재현해야 할 목록이고, 지우면 그 목록이 사라진다.

반환 타입을 `RunPerformance`에서 `unknown`으로 바꿨다. fixture는 **와이어 JSON**이지 파싱된
값이 아니다. 파싱된 타입을 붙이면 fixture가 컴파일러를 만족시키면서 서버가 실제로 보내는 것과
어긋날 수 있고, 그러면 파서가 아니라 타입이 계약을 정하게 된다.

여기에 새 경계를 더했다 — 군 전체가 없는 런, `UNSUPPORTED`인 군, `NOT_REPORTED`인 군, 이 빌드가
모르는 군, 출처가 번갈아 바뀌는 추세.

## Validation

- `npm test` — 71건 통과
- `npm run typecheck` — 통과
- `npm run build` — 통과
- `npm run lint` — 8 errors / 2 warnings. **전부 이 브랜치가 건드리지 않은 파일**
  (`testScenarios/`, `testCases/`, `testRuns/`, `i18n/messages/scenarios.ts`)

**검증하지 못한 것**: 실서버 응답 통과(서버 PR #132 미머지), 브라우저 렌더(1024px·1440px),
키보드 이동. 이 환경에 헤드리스 브라우저가 없다.
