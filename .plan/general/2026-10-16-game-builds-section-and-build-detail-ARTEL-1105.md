# 2026-10-16 — 게임 빌드 섹션과 빌드 상세 화면 추가 (ARTEL-1105)

- Date: 2026-10-16
- GitHub Issue: None (Jira ARTEL-1105, 서버 짝은 ARTEL-1104)
- Status: Implemented (draft PR)

## Goal

프로젝트 rail 에 `게임 빌드` 섹션을 하나 추가한다. 지금 빌드 목록은 QA 실행 화면의 콘솔 dialog 안
`GameBuildPanel` 에만 있어서, "1.4.0 에서 무엇을 돌렸고 무엇이 통과했나" 를 보려면 QA 히스토리 · 케이스
라이브러리 · 화면 지도를 따로 열어야 한다.

- 목록: 빌드마다 version(+ label, editor badge), 만든 날, 마지막 보고, instance 연결 수/전체, cheat · behavior 수,
  QA run 수, 최근 run 상태 pill 과 통과 step/전체 step.
- 상세(`?build=<id>`): 머리(version · label · notes · 만든 날 · 마지막 보고), cheat · behavior catalog
  (`GameFunctionPanel` 재사용), 이 빌드로 돈 QA run 목록(각 run 페이지 링크), 이 버전의 케이스 판정 수(케이스
  라이브러리 `?version=` 링크), 화면 지도 · 성능 링크.
- `GameBuildPanel` 의 빌드마다 새 섹션 상세로 가는 링크.
- nav count 는 editor 가 아닌 빌드 수.

## Non-goals

- 빌드 label · notes 편집을 새 상세로 옮기지 않는다. 편집은 `GameBuildPanel` 에 그대로 둔다.
- 서버 엔드포인트(ARTEL-1104) 구현.
- QA 히스토리 섹션을 빌드로 거르는 기능.

## Context / Constraints

- 서버 계약(ARTEL-1104, 작업 중인 server worktree 의 DTO 로 확인):
  - `GET /api/projects/:p/game-builds/summary` → `{ items: GameBuildSummaryResponse[] }`. 시각은 ISO 문자열 또는 null,
    id 는 문자열. `latestQaRun` 은 `{ qaRunId, status, startedAt, completedAt, stepsPassed, stepsTotal }` 또는 null.
  - `GET /api/projects/:p/qa-runs?gameBuildId=&size=` → `{ items: QaRunResponse[] }`, 새 것이 앞. `size` 는 1..100.
- 옛 서버는 `/summary` 를 모른다. 옛 `GameBuildController` 에는 `GET /{buildId}` 가 없고 `PATCH /{buildId}` 만 있어
  WebFlux 는 405 를 준다. 404 · 405 만 "지원 안 함" 으로 읽고(400 은 오류로 보인다) workspace 의 `builds` · `instances` 로 목록을 만든다. 이때 instance 수와
  마지막 보고는 `instances[].lastGameBuild` 로 같은 정의대로 계산하고, cheat · behavior · QA run 칸은 `—` 이다.
  5xx 와 network 실패는 오류 상태와 재시도로 보인다.
- 섹션 route `game-builds` 는 workspace 안의 정적 경로이고, `/projects/:p/game-builds/:buildId/performance` 와
  `.../content-map` 은 workspace 밖 경로다. React Router 는 더 구체적인 경로를 고르므로 서로 가리지 않는다.
- 상세는 `?build=` 로 연다. 화면 지도와 성능 섹션이 쓰는 관용구이고, 주소를 붙여 넣으면 같은 빌드가 열린다.
  펼침 행이 아닌 이유: 상세에 catalog · run 목록 · 판정 수가 다 들어가 행 안에 두기엔 크다.
- 상세의 세 블록(catalog, QA run, 케이스 판정)은 따로 읽고 따로 실패한다. 하나가 실패해도 나머지는 그린다.
  - QA run: `listProjectQaRuns(projectId, { gameBuildId, size: 20 })`. "더 보기" 는 없다(20개 넘으면 QA 히스토리로).
    `gameBuildId` 를 모르는 서버가 필터를 무시하고 모든 run 을 줄 수 있으므로 client 에서도 `run.gameBuildId === build.id`
    로 한 번 더 거른다. 엔드포인트가 404 면 "이 서버는 빌드별 run 목록을 지원하지 않습니다" 를 그린다.
  - 케이스 판정: 기존 `listTestCaseVersions` 의 `versions` 에서 `gameBuildId` 가 같은 줄을 찾는다. 없으면 "이 버전에
    판정된 케이스가 없습니다" 와 라이브러리 링크만 둔다.
- `?build=` 의 id 가 빌드 목록에 없으면 "빌드를 찾을 수 없습니다" 와 목록으로 돌아가는 링크를 그린다.
  heading 은 그대로 `게임 빌드` 다 — `sectionIdFromPath` 는 pathname 만 본다.
- 목록에는 editor 빌드도 badge 를 달고 맨 뒤에 둔다(편집기로 돈 run 도 이 빌드에 붙는다). nav count 는 editor 를 뺀
  수다 — `GameBuildPanel` 의 빈 상태와 같은 기준.
- 390px 에서 표는 가로 스크롤 region(`tabIndex=0`, `aria-label`) 안에 두어 페이지가 가로로 밀리지 않게 한다.

## Approach (Checklist)

- [x] **Step 0: Recon** — 끝냄. `QaHistorySection` · `GameBuildPanel` · `ContentMapSection` · `testCaseVersions.ts` 확인.
- [x] **Step 1: 데이터**
  - `src/projects/gameBuildSummary.ts`: `GameBuildSummary` 타입, `parseGameBuildSummaryList`,
    `fallbackBuildSummaries(builds, instances)`(옛 서버용), `orderBuildSummaries`(editor 를 뒤로).
  - `src/projects/gameApi.ts`: `listGameBuildSummaries` — 지원 안 하는 서버면 `null`.
  - `src/qa/qaApi.ts`: `parseQaRun` 에 `gameBuildId` 추가, `listProjectQaRuns(projectId, { gameBuildId, size })`.
  - `src/projects/workspace/useGameBuildSummaries.ts`: 섹션이 쓰는 hook.
- [x] **Step 2: 화면**
  - `sections.ts` 에 `{ id: 'gameBuilds', path: 'game-builds' }` 를 `qaHistory` 다음에, `ProjectNav` 아이콘,
    `App.tsx` route, `ProjectWorkspace` count.
  - `GameBuildsSection.tsx`(목록 + `?build=` 분기), `GameBuildDetail.tsx`(상세).
  - `GameBuildPanel` 에 상세 링크.
  - `i18n/messages/gameBuilds.ts` en/ko, nav label.
  - `App.css` 에 `gb-` 접두 규칙.
- [x] **Step 3: Tests** — `gameBuildSummary.test.ts`(parse, fallback, 정렬), `qaApi.test.ts` 에 `gameBuildId`.
- [x] **Step 4: 화면 확인** — Playwright 로 두 새 엔드포인트를 route mock 해서 목록 · 상세 · 옛 서버 fallback ·
  390px 를 찍는다. 실제 서버 캡처는 coordinator 가 ARTEL-1104 를 띄운 뒤 한다.

## Validation

- **Commands to run:** `npm run typecheck`, `npm test`, `npm run build`, `npx eslint <바꾼 파일>`
- **Expected output:** 모두 통과, 새 테스트 포함.

## Risks & Rollback

- **Risks:** ARTEL-1104 계약이 merge 전에 바뀌면 parser 를 맞춰야 한다. 옛 서버 fallback 이 405 외의 코드를 주면
  오류 상태로 보인다.
- **Rollback steps:** `git revert`. 섹션 하나와 링크 하나라 다른 화면에 남는 것이 없다.

## Plan review 반영

- 받아들임: 400 을 fallback 에서 뺌, run 목록 client 측 필터, 판정 수의 출처(`listTestCaseVersions`), 블록별 상태,
  없는 id 처리, `stepsPassed`/`stepsTotal` nullable.
- 받아들이지 않음: fallback 제거 — 서버(ARTEL-1104)와 home 의 배포 순서가 정해지지 않았고 과제가 fallback 을
  요구한다. `orderBuildSummaries` 는 한 줄짜리 정렬이라 남긴다.

## Pair review 반영

- 받아들임: 케이스 판정 블록은 404 를 "지원 안 함" 으로 읽지 않는다(재시도를 낸다), `/summary` 를 읽는 중에는 상세의
  수 칸을 `—` 로 둔다(응답이 오면 수가 바뀌지 않게), 요약에 빌드가 없으면 마지막 보고를 "보고한 instance 없음" 이 아니라
  `—` 로 둔다, 영어 열 이름 `First reported` 로 통일, 응답 뒤 abort 확인.
- 받아들이지 않음: nav count 에 editor 빌드 포함 — 과제가 editor 가 아닌 빌드 수를 요구하고 `GameBuildPanel` 의 기준과
  같다. `Intl.NumberFormat` 공용화 — `QaHistoryDetail` 도 파일마다 둔다. 행 클릭 제거 — QA 히스토리와 같은 동작이다.

## 화면 확인 (route mock)

orchestration-server 없이 Playwright 로 모든 `/api/**` 를 mock 했다(프로젝트 1, 빌드 1.4.0 · 1.2.0 · editor, cheat 5개 ·
behavior 2개). 390px 에서 남는 68px 가로 넘침은 상단 bar 의 로그아웃 버튼이고, QA 히스토리 화면에서도 같다.

## Open Questions

- 상세에서 label · notes 를 편집할 수 있어야 하나? 지금은 콘솔 dialog 에만 둔다.
