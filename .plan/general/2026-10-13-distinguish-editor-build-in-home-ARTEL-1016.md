# 2026-10-13 — home 의 build 선택과 버전 목록에서 editor build 구분

- Date: 2026-10-13
- GitHub Issue: None (Jira ARTEL-1016, Subtask of the story that carries ARTEL-1014)
- Status: Implemented (plan-review and pair-review folded in)

## Goal

서버(ARTEL-1014)는 project 마다 editor 전용 `game_build` 행을 하나 두고, 같은 version 문자열을 쓰는
development build 와 따로 센다. home 은 `game_build` 를 전부 게임 버전으로 보여 주므로 editor 행을 구분한다.

- `GET /api/projects/{projectId}/game-builds` 항목에 `isEditor: boolean` 이 붙는다. editor 행은 목록 맨 끝이다.
  옛 서버는 필드를 생략하므로 없으면 `false` 로 읽는다.
- build `<select>` 에서 editor 행은 `Editor` 로 보이고, 현재 version 이 `Editor · 1.4.0` 처럼 뒤에 붙는다.
- URL 에 `build` 가 없거나 모르는 값이면 editor 가 아닌 build 중 가장 최신을 고른다. editor 행만 있으면 그것을 고른다.
- `GameBuildPanel` 은 editor 행을 버전으로 나열하지 않는다.
- test case 화면이 build id 를 이름으로 풀 때 editor build 는 `Editor` 로 쓴다.
- performance 화면은 바꾸지 않는다(non-goal). 깨지지 않는지만 확인한다.

## Non-goals

- 서버 응답의 정렬 계약 변경. editor 행이 마지막이라는 서버 약속에 기대되, 기본 선택은 그 순서에 기대지 않고 `isEditor` 로 거른다.
- performance 화면은 이번에 그대로 둔다. 알려진 남은 문제: 그 picker 는 editor 행을 version 만으로 보여 주므로,
  development build 와 같은 version 이면 같은 글자가 두 줄 나온다. 기본 선택은 editor 가 마지막이라는 서버 약속 덕에 `builds[0]` 로도 맞다.
- `DashboardSection` 의 "최신 build" 한 줄은 그대로 둔다. editor 행이 마지막이라 `builds[0]` 이 이미 non-editor 이며, editor 행만 있는 project 에서는 대시보드가 그 version 을 최신 build 로 보여 준다.
- performance device 타입의 `isEditor: boolean | null` 은 "Unity editor 에서 돌았는가" 라는 다른 뜻이다. `GameBuild.isEditor` 와 합치지 않는다.

## Context / Constraints

- 같은 `builds[0] ?? ` + `<select>` 패턴이 `ContentMapSection`, `MacroSection`, `PerformanceSection` 에 복사되어 있다.
  `MacroSection` 은 content map 과 같은 build 를 고르는 같은 화면 계열이라 같이 고친다. `PerformanceSection` 은 건드리지 않는다.
- 단위 test 는 `node --test "src/**/*.test.ts"` 라서 `.tsx` 를 import 하지 못한다. 로직은 `.ts` helper 로 둔다.
- 문구는 `src/i18n/messages/projects.ts` 의 `builds` 아래에 en/ko 로 둔다. `Editor` 는 두 언어 모두 `Editor`.
- `.worktrees/` 때문에 `npm run lint` 전체 실행은 실패할 수 있다(memory). 바뀐 파일만 `npx eslint` 로도 돌린다.

## Approach (Checklist)
- [x] **Step 0: Recon** — 완료. `builds` 사용처: `gameTypes.ts`, `gameApi.ts`, `useProject.ts`, `GameBuildPanel.tsx`, `ContentMapSection.tsx`, `MacroSection.tsx`, `PerformanceSection.tsx`, `DashboardSection.tsx`, `testCaseLibrary.ts`, `TestCaseSheet.tsx`.
- [x] **Step 1: 타입과 parsing** — `GameBuild.isEditor: boolean`. `parseBuild` 는 `record.isEditor === true` 일 때만 `true`, 그 밖에는 `false`. `applyBuild`(PATCH 응답) 도 같은 parser 를 쓰므로 따로 손볼 곳이 없다.
- [x] **Step 2: helper** — 새 `src/projects/gameBuilds.ts`:
  - `selectBuild(builds, requestedId)`: id 가 일치하면 그것, 아니면 non-editor 중 `createdAt` 이 가장 늦은 것, 그것도 없으면 editor 행, 목록이 비면 `undefined`. `createdAt` 이 같거나 비면 목록 순서가 앞선 것.
  - `buildOptionText(build, editorLabel)`: editor 는 `Editor · {version}`, 그 밖에는 기존 규칙(`label` 이 있으면 `version · label`, 없으면 `version`).
  - `versionBuilds(builds)`: `isEditor` 가 아닌 행만. `selectBuild` 와 `GameBuildPanel` 두 곳이 쓴다.
  - `describeVerifiedBuild(buildId, builds, editorLabel)` 는 `src/testCases/testCaseLibrary.ts` 에 그대로 두고 인자만 늘린다. editor build 이면 `label` 이나 version 보다 먼저 `editorLabel` 을 낸다.
  - `createdAt` 은 서버가 같은 형식의 ISO-8601 UTC 로 주므로 문자열 비교로 최신을 가른다. `createdAt` 이 같으면 목록 순서가 앞선 것이 남는다.
  - `buildOptionText` 와 `describeVerifiedBuild` 는 둘 다 `label` 을 trim 해서 비었는지 본다.
  - 이름 바꿈은 `<option>` 글자에만 적용한다. 화면 안의 다른 version 표시는 그대로다.
- [x] **Step 3: 화면** — `ContentMapSection` 과 `MacroSection` 이 `selectBuild` 와 `buildOptionText` 를 쓴다. `GameBuildPanel` 은 `versionBuilds` 로 거르고, 거른 뒤 비었는데 editor 행이 있으면 `emptyEditorOnly` 문구를, 목록 자체가 비면 기존 `empty` 문구를 쓴다. `TestCaseSheet` 가 `describeVerifiedBuild` 에 editor 라벨을 넘긴다.
- [x] **Step 4: 문구** — `projects.builds.editorLabel` en/ko 추가(`Editor`).
- [x] **Step 5: Tests** — `parseBuild` 를 export 해 직접 시험한다. 기존 `makeBuild` fixture 에 `isEditor: false` 를 넣고 `describeVerifiedBuild` 호출에 세 번째 인자를 넣는다. `gameApi` parsing 기본값(필드 없음, `false`, `true`, 잘못된 타입), `selectBuild`(non-editor 최신, editor 만, 요청 id 우선, 모르는 id, 빈 목록), `buildOptionText`, `versionBuilds`, `describeVerifiedBuild` editor.

## Validation
- **Commands to run:** `npm run typecheck`, `npx eslint <changed files>` 와 `npm run lint`, `npm test`.
- **Result (2026-10-14):** `npm run typecheck` exit 0, `npm test` 통과, 바뀐 파일 `npx eslint` exit 0, `npm run build` 성공. 전체 `npm run lint` 는 이 변경과 관계없는 8개 파일에서 오류 8개, 경고 3개로 실패한다.
- **Expected output:** 모두 exit 0, 새 test 통과. 전체 `npm run lint` 가 `.worktrees` 때문에 실패하면 `npx eslint <changed files>` 로 대신하고 그렇게 적는다. `.tsx` 의 picker 는 단위 test 로 닿지 않으므로 `npm run build` 로 컴파일만 확인하고, 화면 동작은 확인하지 않았다고 적는다.

## Rejected feedback
- `selectBuild` 에서 `createdAt` 최신 찾기를 빼자는 제안: 요구가 "가장 최신 non-editor" 이고, 화면이 서버의 정렬 순서에 기대지 않게 하려고 유지한다.
- `versionBuilds` 를 인라인하자는 제안: `selectBuild` 와 `GameBuildPanel` 두 곳이 쓰므로 유지한다.

## Risks & Rollback
- **Risks:** 옛 서버가 `isEditor` 를 주지 않으면 모든 행이 version 으로 보인다(이전 동작과 같다). editor 행이 마지막이라는 서버 약속이 깨져도 기본 선택은 `isEditor` 로 거르므로 영향이 없다.
- **Rollback steps:** `git revert`.

## Open Questions
- 없음.
