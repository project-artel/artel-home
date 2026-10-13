# 2026-10-13 — test case 라이브러리에 폴더 tree 와 test case 이동 추가

- Date: 2026-10-13
- GitHub Issue: None (Jira ARTEL-970, Story ARTEL-966)
- Status: Implemented

## Goal

test case 라이브러리 왼쪽에 폴더 tree 를 두고, 폴더를 만들고 이름을 바꾸고 옮기고 지우며, 선택한 test case 를 폴더로 옮긴다.

## Non-goals

- drag and drop 이동
- 폴더 정렬 순서 지정 (이름순 고정)
- test case 편집기에서 폴더를 바꾸는 필드 (이동은 목록의 선택 bar 로만)

## Context / Constraints

- ARTEL-968 branch 위에 쌓는다. 다중 선택(`useCaseSelection`, `CaseSelectionBar`)을 재사용한다.
- 서버 API 는 merge 전이다. 계약:
  - `GET /api/projects/:projectId/test-case-folders` -> `{ items: [{ id, parentId, name, contentMapId, gameBuildId }] }` (id 는 문자열, `parentId`/`contentMapId`/`gameBuildId` 는 nullable)
  - `POST` `{ name, parentId }` -> 201 폴더, `PUT /:folderId` `{ name, parentId }` (자기 자신이나 하위로 옮기면 400), `DELETE /:folderId` -> 204 (하위 폴더도 지워지고 그 안의 test case 는 폴더 없음), 같은 부모 아래 같은 이름은 409
  - `POST /api/projects/:projectId/test-cases/move` `{ caseIds, folderId | null }` -> `{ moved }`
  - test case 응답에 `folderId: string | null`, 생성 요청은 `folderId` 를 받는다.
- 새 test case 를 만드는 편집기, 색, 문자열 규칙은 ARTEL-968 과 같다 (semantic token, en/ko i18n).

## Design decisions

1. **순수 helper 는 `testCaseFolders.ts`.** `buildFolderTree`(이름순 중첩), `flattenFolderTree`(들여쓰기 깊이가 붙은 행 목록), `collectDescendantIds`(순환 방어), `filterByFolder`, `countCasesByFolder`, `listMoveTargets`(폴더를 옮길 때 자기와 하위를 뺀 부모 후보), `describeFolderDeletion`(지워질 하위 폴더 수).
   부모가 목록에 없는 폴더(고아)는 root 로 올려 그린다 — 서버 정합성이 깨져도 폴더가 화면에서 사라지지 않는다.
2. **선택은 `FolderSelection = { kind: 'all' } | { kind: 'none' } | { kind: 'folder', id }`.** URL `?folder=` 에 실린다: 없으면 전체, `none` 이면 폴더 없음, 그 밖은 폴더 id. ARTEL-972 가 이 주소로 링크한다.
   존재하지 않는 id 는 전체로 되돌린다(삭제된 폴더 링크).
3. **폴더 필터는 기존 필터 앞에서 한 번 건다.** `filterByFolder` 로 좁힌 목록을 `selectTestCases`, tally, scene 필터가 모두 읽는다. 그래야 "N건 중 M건", status chip 의 수, scene 목록이 같은 범위를 말한다.
   폴더를 고르면 그 폴더와 하위 폴더의 test case 가 보인다. 폴더 없음은 `folderId === null`.
4. **폴더 조작은 tree 아래 도구줄에서 한다.** 줄마다 메뉴를 두면 키보드 순서와 popup 관리가 늘어난다. 도구줄: `새 폴더`(고른 폴더 아래, 전체/폴더 없음이면 root), `이름 변경`, `이동`, `삭제` — 고른 것이 실제 폴더일 때만 활성. 비활성일 때 이유는 title 로 둔다.
   tree 는 중첩 `ul` 안의 button 이고 고른 항목은 `aria-current="true"`. Tab 으로 닿는다. 접기/펼치기는 두지 않는다 (YAGNI; 폴더가 수백 개가 되면 별도).
5. **폴더 dialog 하나(`FolderDialog`)가 만들기, 이름 변경, 이동 세 모드를 맡는다.** 이름 입력(만들기·이름 변경), 부모 select(이동). 서버 오류: 409 는 "같은 이름이 이미 있다", 400 은 "그 위치로 옮길 수 없다", 그 밖은 일반 실패. 이름은 trim 해서 비면 보내지 않는다.
6. **삭제 확인**은 `ConfirmActionDialog` 에 폴더 이름과 "하위 폴더 N개도 함께 지워지고, 그 안의 test case 는 폴더 없음으로 옮겨진다" 를 적는다. 삭제 후 폴더 목록과 test case 목록을 `refresh` 하고, 고른 폴더가 지워졌거나 지워진 하위였으면 전체로 돌린다.
7. **test case 이동**은 `CaseSelectionBar` 에 `폴더로 이동` button(`onMove`)을 더하고, `MoveCasesDialog` 에서 대상 폴더(들여쓴 이름) 또는 `폴더 없음` 을 고른다. 성공하면 로컬 목록의 `folderId` 를 바꾸고(`applyMoved`), 조용히 `refresh`, 선택을 비우고 announcement.
   현재 보는 폴더 밖으로 옮긴 줄은 필터에서 빠지며 선택 규칙대로 사라진다.
8. **새 test case 는 고른 실제 폴더 안에 만든다.** `TestCaseSheet` -> `TestCaseEditor` 에 `folderId` prop 을 내리고 `createTestCase` 의 입력에 싣는다.
9. **content map 이 만든 폴더**(`contentMapId !== null`)는 이름 옆에 작은 `content map` 배지와 title 로 구별한다. 색만으로 구별하지 않는다.
10. **레이아웃.** `.tcl` 은 block 이다. folder tree 는 목록 panel 왼쪽의 고정 폭(240px) 열이고, 1439px 아래에서는 목록 위로 쌓인다. sheet 는 기존대로 fixed.

## Approach (Checklist)

- [ ] Step 0: Recon — 완료 (`TestCaseLibrary`, `TestCaseSheet`, `TestCaseEditor`, `App.css` `.tcl`)
- [ ] Step 1: types/API — `TestCase.folderId`, `TestCaseInput.folderId`, `parseTestCase`; `testCaseFolderApi.ts`(list/create/update/delete, 파서); `moveTestCases` in `testCaseApi.ts`
- [ ] Step 2: 순수 helper `testCaseFolders.ts` + 단위 테스트
- [ ] Step 3: hook `useTestCaseFolders`; `useTestCaseLibrary.applyMoved`
- [ ] Step 4: UI — `FolderTree.tsx`, `FolderDialog.tsx`, `MoveCasesDialog.tsx`, `CaseSelectionBar` 에 이동 button, `TestCaseLibrary` 연결, 새 test case 의 `folderId`
- [ ] Step 5: i18n en/ko, CSS
- [ ] Step 6: 검증 — `npm test`, `npm run typecheck`, `npm run build`, `npx eslint <변경 파일>`

## Validation
- **Commands to run:** `npm test`, `npm run typecheck`, `npm run build`, `npx eslint <changed files>`
- **Expected output:** 0 exit.
- **Tests:** tree 만들기(이름순, 중첩, 고아), 하위 id 집합(순환 방어), 폴더 필터(전체/없음/폴더+하위), 필터와 scene/상태/검색어 결합, 이동 후보에서 자기·하위 제외, 삭제될 하위 폴더 수, 주소 `?folder=` 파싱, API mock(요청 경로·본문, 409/400 의 `ProjectApiError`, 204 삭제).
- **Manual:** 서버 API 가 merge 되지 않아 stack screenshot 은 만들지 못한다.

## Risks & Rollback
- **Risks:** 서버 계약 변경(한 곳씩 고친다), 폴더가 많을 때 tree 길이(접기 없음), `TestCase.folderId` 가 필수라 서버가 아직 안 보내면 `null` 로 읽혀 모든 test case 가 "폴더 없음" 이 된다.
- **Rollback steps:** `git revert`.

## Open Questions
- 없음.

## Plan review outcome (fast / medium / heavy)

반영한 것:
- `moveTestCases` 는 `bulkDeleteTestCases` 와 같은 1..500 상한을 두고 범위를 벗어나면 `RangeError` 를 던진다. 편집(PUT) 경로는 `folderId` 를 보내지 않는다 — `toPatch` 가 `folderId` 를 만들지 않으므로 저장이 폴더를 풀 수 없다.
- 열린 sheet 의 test case 는 `library.cases` 에서 찾으므로 폴더 필터 밖으로 옮겨져도 sheet 는 열려 있다.
- `?folder=` 는 `useSearchParams` 로 읽고 쓰며 `replace` 로 갱신하고 다른 parameter 를 보존한다. 없는 폴더 id 를 전체로 돌리는 규칙은 폴더 목록이 `ready` 일 때만 적용한다.
- 폴더 목록을 못 읽으면 tree 자리에 오류와 `다시 시도` 를 보이고, test case 목록은 그대로 그린다. 이때 폴더 필터는 걸지 않는다(전체와 같은 범위가 아니라 필터 자체가 없다고 tree 가 말한다).
- 폴더 조작은 `FolderPane` 이 tree, 도구줄, dialog 를 모두 가진다. `TestCaseLibrary` 로는 선택과 변경 알림만 오간다.
- 부모 고르기는 `FolderPicker` 하나를 폴더 dialog 와 이동 dialog 가 같이 쓴다.
- `.tcl` 은 `display:block` 이라 grid 열 규칙이 죽어 있었다. `.tcl` 을 `240px minmax(0,1fr)` grid 로 바꾸고, 1439px 아래에서는 한 열로 쌓되 tree 에 max-height 와 scroll 을 둔다. sheet 와 scrim 은 fixed 라 영향이 없다.
- 선택 가능한 도구가 없을 때 이유를 title 이 아니라 눈에 보이는 문구로 쓴다. tree 는 중첩 `ul` 이고 `nav` landmark 에 label 이 있다.
- 건수 배지는 `countCasesByFolder` 가 낸다(하위 폴더 포함).
- content map 이 만든 폴더도 이름 변경, 이동, 삭제를 막지 않는다. 다음 적재가 다시 만들 수 있다는 서버 쪽 사정은 이 화면이 모르므로 배지의 title 로만 알린다.
- 이동·만들기·이름 변경·삭제 뒤 announcement 를 남긴다.

반영하지 않은 것:
- 폴더 이름 길이 제한: 서버 한도를 모르므로 client 에서 숫자를 지어내지 않는다. 비어 있으면 dialog 안에서 알리고, 서버의 400 은 일반 문구로 보인다.
- `useTestCaseFolders` 를 단순 effect 로: 케이스 hook 과 같은 `source` 패턴을 유지한다(두 hook 이 같은 모양이어야 읽기 쉽다).
- Step 0b 서버 확인: 서버 PR 이 다른 worktree 에서 진행 중이고 이 작업의 범위가 아니다. 계약은 mock 테스트로 못 박고, 어긋나면 `testCaseFolderApi.ts` 와 `moveTestCases` 만 고친다.

## Pair review outcome

- 수용: 폴더를 만들거나 바꾼 직후 서버 응답을 목록에 바로 끼운다(`applyUpserted`)고 다시 읽기는 번호를 매겨 늦은 답을 버린다. 폴더 링크로 들어왔는데 폴더 목록이 아직 없으면 전체 목록 대신 loading 을 보인다. 선택 해석을 `effectiveFolderSelection` 으로 빼서 테스트한다. 폴더 select 의 들여쓰기에 `└` 를 붙인다. 삭제 후 focus 를 tree 로 옮기고, 404 면 tree 를 다시 읽는다. nav 에 별도 label. 고아 폴더를 옮길 때 부모를 최상위로 본다. 값이 바뀌지 않은 이름 변경·이동은 제출을 막는다. 이동 announcement 는 서버가 답한 건수를 쓴다. CSS 중복 규칙을 지웠다.
- 수용하지 않음: `FolderPane`, dialog 의 component 테스트 — 이 repo 에 component 테스트 환경이 없다. 이동 dialog 의 기본값을 비우는 것 — `폴더 없음` 이 기본인 것은 현재 폴더로 시작하는 규칙과 일관되고, Enter 한 번으로 바뀌는 것은 확인 button 이 건수를 적고 있다.
