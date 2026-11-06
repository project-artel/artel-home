# 2026-10-21 — 프로젝트 대시보드를 지금 볼 것 중심으로 다시 짠다 (ARTEL-1164)

- Date: 2026-10-21
- GitHub Issue: None (Jira ARTEL-1164)
- Status: Implemented (draft PR)

## Goal

돌아온 사람이 대시보드에서 먼저 묻는 세 가지를 맨 위에서 답한다.

1. 검증할 TC 가 몇 개 남았나 — 이전 빌드 결과로 나눠서(고쳐졌는지 확인 · 회귀 확인 · 처음 판정).
2. 문제가 몇 개인가 — 실패한 TC · 회귀 · 미해결 이슈 · Blocker/Critical.
3. 이전 버전보다 나아졌나 — 두 빌드 판정 막대, 고쳐짐 · 새로 깨짐 · 그대로 실패 · 빠진 TC.

그 아래 QA 히스토리 표, 실행마다 토큰 비용(빌드별 선, 껐다 켜기), 이슈 주간 추이, 시나리오별 최근 결과,
최근 테스트 런 · 안 담긴 케이스, 맨 밑에 게임 정보.

검증 남은 TC 에서 바로 Free 실행을 만든다: 남은 TC 중에서 골라 FREE 시나리오 하나짜리 테스트 런을 만들고,
그 런과 `agent` 엔진을 고른 채로 QA 실행 화면을 연다. 실행은 거기서 사람이 누른다.

## Non-goals

- 서버 API 추가. 칸마다 이미 있는 API 만 읽는다.
- 사용자가 대시보드를 직접 구성하기(Grafana 식). 범위가 커서 뺐다.
- 팀 게시판 위젯 · 이슈 출처 줄. 이슈 공유(ARTEL-1114) 가 develop 에 들어간 뒤 따로 한다.

## Context / Constraints

- 읽는 API: `GET /api/projects/{p}/qa-runs?limit=50`, `GET /api/qa-tries?projectId&size=100`,
  `GET /api/llm-usage/qa-runs?projectId&from&to&size=100`(90일), 시나리오 목록, 이슈 첫 쪽,
  `GET /api/projects/{p}/test-case-versions` 와 `.../{build}/cases?compareTo={prev}`.
- 사용량 응답은 시도(qa_try) 단위라 실행 · 빌드가 없다. 시도 → 실행(`qaRunId`) → 빌드(`gameBuildVersion`) 로 잇는다.
  토큰이 0 인 실행(모델을 안 부른 실행)은 점에서 뺀다.
- Free 실행은 서버에 한 번에 만드는 길이 없어 `createTestRun` → `createTestScenario` → `updateScenario`
  (`buildFreeScenarioDraft`) → `approveTestScenario` → `setRunScenarios` 다섯 번 부른다. 중간에 실패하면 그때까지 만든
  런이 남는다(이름 `대시보드 Free · {빌드} · TC {n}건 · {날짜}` 로 알아본다). `planner_executer` 는 FREE 를 못 돌려
  `&engine=agent` 로 넘긴다.
- 섹션 공통 폭 1240px 은 대시보드에만 2000px 로 넓힌다. 그래프는 칸의 실제 폭으로 viewBox 를 잡는다.

## Approach

- 숫자는 `dashboardModel.ts` · `freeRunCases.ts` 의 순수 함수가 접고 테스트한다. 화면은 그리기만.
- 칸마다 따로 읽고 따로 실패한다(`useDashboardData`) — 사용량을 못 읽어도 QA 히스토리는 보인다.
- 고르기 창: 처음엔 먼저 볼 것(이전 빌드에서 판정이 있던 TC)이 골라져 있다. 왼쪽은 이전 결과 · 화면별 수,
  오른쪽은 찾기 · 보이는 것 모두 고르기 · 고른 것만 보기. TC 가 많아져도 좁혀서 고른다.

## Validation

- `npm test` 1313 통과, `npx tsc -b`, 바꾼 파일 `eslint`, `npx vite build`.
- 로컬 스택(orche 8080 · Postgres · Redis)에서 project 2(빌드 둘) · project 1(빌드 하나) · 다크 · 라이트.
- Free 실행 끝까지: 런 #188 · 시나리오 #762(`FREE`, step 82개) 생성 → QA 실행이 그 런과 `agent` 로 열림 → 둘 다 지움.

## Risks

- 이슈는 첫 쪽만 읽어 주간 추이가 오래된 이슈를 덜 센다.
- 사용량 100행 · 시도 100행 상한을 넘는 프로젝트는 비용 그래프 앞쪽이 빈다.
