# 2026-10-13 — content map 화면에 test case 생성 버튼 추가

- Date: 2026-10-13
- GitHub Issue: None (Jira ARTEL-972, Story ARTEL-964)
- Status: Implemented

## Goal

content map 적재가 더는 test case 를 만들지 않으므로, content map 화면에서 사용자가 직접 test case 를 생성한다.

## Non-goals

- 생성 결과의 미리보기나 취소
- content map 이 바뀔 때 자동 재생성

## Context / Constraints

- ARTEL-970 branch 위에 쌓는다. 그 PR 의 `?folder=` 주소(`/projects/:projectId/test-cases?folder=<id>`)로 링크한다.
- 계약 (서버 미 merge): `POST /api/projects/:projectId/game-builds/:gameBuildId/content-map/test-cases` -> 200 `{ folderId, created, updated, deleted, broken }`, 404 build 없음, 409 적재된 content map 없음.
- 화면은 `ContentMapReport`(`src/contentMap/ContentMapPage.tsx`). 비어 있는 세 갈래는 `contentMap === null`(한 번도 올리지 않음), `ingestedAt === null`(올렸지만 아직 안 읽음), 그 외다.

## Design decisions

1. **버튼은 header 의 새로고침 옆이 아니라 별도 panel(`ContentMapTestCases`)에 둔다.** 결과 건수, 오류 문구, 라이브러리 링크가 들어갈 자리가 필요하다. 위치는 `EvidenceScanPanel` 아래, 본문 위.
2. **활성 조건은 `contentMap !== null && ingestedAt !== null`.** 아니면 disabled 이고 이유를 panel 안의 문장으로 보인다(`notUploaded`, `notIngested`). `title` 에만 두지 않는다.
3. **진행 중 재클릭 방지**: 상태가 `running` 인 동안 `disabled` 이고, 클릭 handler 도 ref 로 한 번 더 막는다(같은 tick 의 두 click).
4. **결과**: 성공하면 `생성 N · 갱신 N · 삭제 N · BROKEN N` 한 문장과 `test case 라이브러리에서 열기` 링크. `folderId` 가 비어 있으면 폴더 없이 라이브러리 링크만 낸다. 건수가 모두 0 이면 "바뀐 것이 없습니다" 로 말한다. 결과는 `role="status"`.
5. **오류 문구는 셋**: 409 -> 적재된 content map 이 없다(새로고침해 보라), 404 -> 이 build 를 찾을 수 없다, 그 밖 -> 일반 실패. `role="alert"`.
6. **순수 로직은 `contentMapTestCases.ts`**: `describeGenerationAvailability`, `classifyGenerationFailure`, `testCaseLibraryPath`, `parseGenerationResult`. API 호출 `generateContentMapTestCases` 는 `contentMapApi.ts`.
7. 결과는 build 를 바꾸면 사라진다 (`ContentMapReport` 가 build 마다 새로 마운트되므로 별도 처리 없음).

## Approach (Checklist)

- [x] `generateContentMapTestCases.ts`: API 호출 + 결과 타입/파서 (읽기 전용 `contentMapApi.ts` 에 쓰기 호출을 섞지 않는다)
- [x] `contentMapTestCases.ts` 순수 함수 + 테스트
- [x] `ContentMapTestCases.tsx` 와 `ContentMapReport` 연결
- [x] i18n en/ko, CSS
- [x] `npm test`, typecheck, build, eslint

## Validation
- **Commands to run:** `npm test`, `npm run typecheck`, `npm run build`, `npx eslint <changed files>`
- **Tests:** 버튼 상태 3갈래, 409/404/기타 분류, 링크 경로 인코딩, 응답 파싱(숫자 아님·folderId 없음), 요청 경로/메서드 mock, 결과 문구(en/ko, 0건 포함).
- **Manual:** 서버 API 미 merge 로 stack 확인 불가.

## Risks & Rollback
- **Risks:** 서버 계약 변경, 링크가 ARTEL-970 의 `?folder=` 에 의존(970 이 먼저 merge 되어야 폴더가 열린다).
- **Rollback steps:** `git revert`.

## Open Questions
- `BROKEN` 이 정확히 무엇을 뜻하는지(화면이 사라진 test case 인지)는 서버 정의를 몰라 설명 문구를 넣지 않았다. 서버 PR 확인 후 문구를 더한다.

## Plan review outcome (fast / medium / heavy)

- 수용: 순수 함수에 계약을 싣는다(`describeGenerationBlock`, `isGenerateDisabled`, `classifyGenerationFailure`, `testCaseLibraryPath`, 결과 문구 en/ko) — DOM 테스트 환경이 없어 component 렌더 테스트는 추가하지 않는다. 409 문구는 header 의 새로고침을 가리킨다. API 호출은 `generateContentMapTestCases.ts` 로 분리. `aria-busy`, 막힌 이유를 `aria-describedby` 로 연결, `role="status"`/`role="alert"` 영역은 항상 마운트. `ContentMapSection` 이 build 마다 `key` 를 주므로 결과는 build 를 바꾸면 사라진다(확인함). 읽을 수 없는 200 본문은 `ProjectApiError` 로 올라 `other` 로 분류됨을 테스트.
- 거절: 모듈을 하나로 합치기 — 판정(`contentMapTestCases.ts`)과 요청(`generateContentMapTestCases.ts`)은 import 하는 쪽이 달라 둘로 둔다. 결과가 content map 새로고침 뒤에도 남는 것은 의도다(생성 결과는 새로고침으로 달라지지 않는다).

## Pair review outcome

- 수용: i18n 의 `scanStatus` 주석 자리 복구, 막힌 이유에 이미 있는 `cm-scan-blocked` 사용.
- 수용하지 않음: component 렌더 테스트(DOM 환경 없음), `isGenerateDisabled` 삭제(판정 한 곳에 두는 쪽을 택했다), 이상한 200 응답을 오류로 보기(계약이 고정이고 버튼이 이미 막혀 있어 위험이 낮다 — 서버 PR 과 맞춰 본 뒤 결정), content map 이 다시 적재될 때 결과 지우기, `cm-scan` 클래스 재사용(스타일 중복을 피하려는 선택이고 이름 변경 때 같이 고친다).

## Fix (2026-10-13): 문서가 없는 build 에 "근거는 올라왔지만 아직 읽히지 않았습니다" 가 뜨는 문제

`content_map` 행은 있지만 문서가 0건인 build(로컬 build `1.0`)에서 비활성 이유가 거짓이었다. Home 은 `ingestedAt === null` 만 봤다.

서버 응답(`ContentMapResponse`, orch ARTEL-971 worktree 의 `ContentMapViewDtos.kt`)이 이미 구별에 필요한 값을 준다:
- `pendingDocuments` — "등록됐지만 아직 앉지 못한 문서". `ingestedAt` 은 앉은 문서에서 유도하므로, `ingestedAt === null` 이고 `pendingDocuments` 도 비었으면 올라온 문서가 하나도 없다.
- `contentMap.capture/schemaVersion/evidenceDigest` 가 null 이면 근거 문서가 없다는 신호이지만, 서버 문서가 "이 사실로 `rootedBy` 를 유도하지 말라" 고 하므로 쓰지 않았다.

그래서 서버는 바꾸지 않는다. 판정을 세 갈래로 나눈다: `notUploaded`(`contentMap` 없음), `noDocuments`(행은 있고 문서 없음), `notIngested`(문서는 있고 아직 안 읽힘). `ContentMapBody` 의 같은 빈 상태 문구도 같은 이유로 고친다(같은 조건이 거짓을 말하고 있었다).

Pair review: 문서가 있는 build 에서 모든 문서의 적재가 실패한 경우(`ingestFailedAt`)는 지금도 "아직 읽히지 않았다" 로 보인다(수정 전과 같은 알려진 한계, 별도 갈래로 나누지 않았다). 문서를 올린 직후 REST 를 다시 읽기 전까지는 SSE 가 이미 문서를 세고 있어도 `pendingDocuments` 가 비어 "올라온 문서가 없다" 로 보일 수 있다 — 새로고침하면 사라지는 짧은 창이라 SSE 수를 섞지 않았다. 판정 규칙은 `describeGenerationBlock` 한 곳에 두고 `ContentMapBody` 도 그것을 부른다. 한국어 문구는 `증거` 로 통일했다.
