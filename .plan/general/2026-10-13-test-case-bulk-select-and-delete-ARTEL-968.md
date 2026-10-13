# 2026-10-13 — test case 목록에 다중 선택과 일괄 삭제 추가

- Date: 2026-10-13
- GitHub Issue: None (Jira ARTEL-968, Story ARTEL-965)
- Status: Implemented (scope change 2026-10-13 applied)

## Goal

test case 라이브러리 목록에서 여러 건을 골라 한 번에 삭제한다.

- 줄마다 checkbox, 헤더에 "보이는 목록 전체" checkbox
- 선택 건수 표시와 선택 해제 버튼
- 삭제 버튼 -> 건수를 적은 확인 dialog -> `POST /api/projects/:projectId/test-cases/bulk-delete` 한 번 -> 목록 다시 읽기
- 필터를 바꿔 보이지 않게 된 test case 는 선택에서 빠진다
- 키보드만으로 선택과 삭제가 된다
- ARTEL-970 의 "선택한 test case 를 폴더로 이동" 이 같은 선택 상태를 재사용한다

## Scope change (2026-10-13): 마우스와 키보드 조합

Jira ARTEL-968 의 "마우스와 키보드 조합" 절이 계약이다. 파일 탐색기처럼 고른다.

- 그냥 click: 편집기를 열고, 다중 선택을 비우고, 그 줄을 범위의 시작점(anchor)으로 삼는다.
- Ctrl/Cmd click: 그 줄을 토글한다. 편집기는 열지 않는다.
- Shift click: 시작점부터 click 한 줄까지로 선택을 바꾼다. Ctrl/Cmd+Shift click 은 기존 선택에 범위를 더한다.
- Shift+ArrowUp/Down: 시작점부터 움직인 커서까지로 선택을 늘리거나 줄인다.
- 선택이 있을 때 Delete 는 삭제 확인 dialog 를 연다(바로 지우지 않는다). 입력칸, select 안에서는 가로채지 않는다.
- 범위도 500건 상한을 넘지 않는다. 범위의 줄을 보이는 순서대로 앞에서 상한까지만 받는다.
- Shift click 은 브라우저의 글자 선택을 만들지 않는다. checkbox click 도 시작점을 정한다. 필터로 시작점이 숨겨지면 시작점이 없는 것으로 본다.

결정:
1. 규칙은 `testCaseSelection.ts` 의 순수 함수(`resolveAnchor`, `rangeBetween`, `selectRange`)에 둔다. 시작점이 없는 Shift click 은 Ctrl click 처럼 그 줄을 토글한다.
2. `useCaseSelection` 이 시작점을 상태로 갖고 render 중에 정리한다. `selectedIds`, `clear` 의 모양은 그대로라 ARTEL-970 의 이동이 영향을 받지 않는다. `clear` 는 시작점도 지운다.
3. 행은 `TestCaseLibrary.tsx` 가 직접 그린 `<tr>` 이고 `CaseListRow.tsx` 는 ⌘K palette 의 행이라 건드리지 않는다.
4. 문서 순서: click 으로 고른 행은 `chosen` 클래스로 배경을 깐다(편집기가 열린 행 `picked` 의 띠와 구별).
5. 키보드 시작점이 없을 때 Shift+화살표의 시작점은 움직이기 전의 커서 줄이다. 커서(`active`)는 기존대로 mouse hover 를 따른다.
6. macOS 에는 Delete 키가 없어 Cmd+Backspace 도 같은 동작으로 둔다.

## Non-goals

- 삭제 취소(undo)
- drag 선택
- 폴더 이동 UI (ARTEL-970)

## Context / Constraints

- 서버 API (orchestration ARTEL-967) 는 아직 merge 되지 않았다. 계약: 요청 `{ caseIds: string[] }` (1..500), 응답 `{ deleted: number }`.
  테스트는 mock 응답으로 한다.
- `TestCaseLibrary.tsx` 의 행은 click 하면 side sheet 가 열리고, 패널의 `onKeyDown` 이 ArrowUp/ArrowDown(`useCaseListNav`)과 Enter(열기)를 처리한다.
  checkbox 의 click 과 Enter 가 이 동작과 부딪치면 안 된다.
- 확인 dialog 는 기존 `ConfirmActionDialog` primitive 를 쓴다 (취소가 먼저 focus, 실패 문구 inline).
- 한 번에 500건 상한이 서버 계약이다. 보이는 목록이 500건을 넘을 수 있으므로 선택 쪽에서 상한을 둔다 (아래 결정 1).
- 문자열은 `src/i18n/messages/testCases.ts` 의 en/ko 쌍에 둔다. 색은 semantic token 만 쓴다.

## Design decisions

1. **500건 상한은 선택 단계에서 막는다.** 서버가 500 초과를 400 으로 거절하고, 여러 번 나눠 부르면 "한 번 호출" 조건과 원자성이 깨진다.
   `MAX_BULK_SELECTION = 500`. 전체 선택은 보이는 목록의 앞 500건을 고르고, 상한에 닿으면 안 골라진 줄의 checkbox 는 disabled, 선택 줄에 "한 번에 500건까지" 안내를 보인다.
2. **선택 상태는 별도 hook `useCaseSelection(visibleIds)` 가 가진다.** 라이브러리 컴포넌트가 아니라 hook 이라 ARTEL-970 의 이동 action 이 `selectedIds` 와 `clear` 를 그대로 읽는다.
   규칙(순수 함수)은 `testCaseSelection.ts` 에 두고 단위 테스트한다.
3. **보이지 않게 된 선택은 render 중 prune 한다.** effect 로 하면 한 frame 동안 숨은 건수가 count 와 삭제 대상에 남는다.
   `pruneToVisible` 이 바뀐 게 없으면 같은 Set 참조를 돌려주므로, `if (pruned !== selected) setSelected(pruned)` 가 무한 render 를 만들지 않는다.
4. **삭제 후에는 로컬에서 먼저 지우고(`removeCases`), 조용히 다시 읽는다(`refresh`).** `reload()` 는 `loading` 상태를 거쳐 화면 전체를 unmount 하므로 scroll, 커서, sheet, dialog 의 focus 복귀 대상이 한꺼번에 사라진다. `refresh` 는 `source` 를 바꾸지 않고 다시 읽어 성공하면 목록을 서버 값으로 맞추고, 실패하면 로컬에서 이미 지운 목록을 그대로 둔다.
   선택을 비우고, `active` 를 0 으로 돌리고, 열려 있던 sheet 의 test case 가 삭제 대상에 들었으면 sheet 를 닫는다. 성공하면 focus 를 select-all checkbox 로 옮기고(선택 bar 는 사라진다) `announcement` live region 에 "N건 삭제했습니다" 를 알린다.
5. **키보드.** 행 checkbox 는 Tab 으로 닿고 Space 는 native 로 토글한다. 목록에서 행 위를 mouse 가 지나간 자리(`active`)를 Space 가 토글하는 규칙은 두지 않는다 — 행이 focus 를 받지 못하고, mouse 위치에 따라 엉뚱한 줄이 토글된다.
   행 checkbox 에 focus 가 있을 때 ArrowUp/ArrowDown 은 이웃 행의 checkbox 로 focus 를 옮긴다(panel 의 기존 ArrowUp/Down 은 `active` 만 바꾸고 focus 는 그대로라 쓸 수 없다).
   panel 의 Enter(열기)는 button, select, checkbox 에서 오면 무시한다. 그렇지 않으면 `선택 삭제` 에서 Enter 를 눌러도 `preventDefault` 때문에 dialog 대신 sheet 가 열린다. 기존 `새 케이스` button 도 같은 문제를 고친다.
   dialog 는 `Dialog` primitive 의 focus trap 을 쓴다.
6. **선택 bar.** 선택이 0건이면 렌더하지 않는다. 있으면 `role="status"` 영역에 "N건 선택됨", `선택 해제`, `선택 삭제` button. `children` slot 은 두지 않는다 — ARTEL-970 이 필요할 때 이 컴포넌트를 고친다. 상한에 닿으면 안내 문구를 보이고, 비활성 checkbox 가 `aria-describedby` 로 가리킨다.
7. **checkbox 접근성.** 행 checkbox 의 `aria-label` 에 스텝 이름을 넣고, 칸(`td`)의 click 은 `stopPropagation` 해서 sheet 가 열리지 않게 한다. header checkbox 의 `indeterminate` 는 ref 로 DOM 에 건다.
8. **앞 500건은 현재 정렬 순서의 앞 500건이다.** header checkbox 는 상한 안의 줄이 모두 선택됐을 때 checked 이고, 700건 중 500건이 선택된 상태도 checked 로 그린다.

## Approach (Checklist)

- [x] **Step 0: Recon** — 완료. `TestCaseLibrary.tsx`, `useTestCaseLibrary.ts`, `ConfirmActionDialog.tsx`, 테이블 CSS(`App.css` `.tct-*`).
- [x] **Step 1: 순수 규칙** `src/testCases/testCaseSelection.ts`
  - `toggleSelection(selected, id, limit)`: 있으면 뺀다, 없으면 limit 미만일 때만 더한다. 새 Set 반환.
  - `toggleAllVisible(selected, visibleIds, limit)`: 보이는 앞 `limit` 건이 모두 선택돼 있으면 비우고, 아니면 그 앞 `limit` 건으로 바꾼다.
  - `pruneToVisible(selected, visibleIds)`: 안 바뀌면 같은 참조.
  - `describeAllVisible(selected, visibleIds, limit)`: `'none' | 'some' | 'all'` (header checkbox 의 checked/indeterminate).
- [x] **Step 2: hook** `src/testCases/useCaseSelection.ts` — `{ selectedIds, count, isSelected, toggle, toggleAllVisible, visibleState, clear, isLimitReached }`.
- [x] **Step 3: API** `testCaseApi.ts` 에 `bulkDeleteTestCases(projectId, caseIds): Promise<number>`. 0건이나 500건 초과는 요청 전에 던진다. 응답 `deleted` 가 숫자가 아니면 0. 호출부는 건수를 안내 문구에 쓴다.
- [x] **Step 4: UI** `TestCaseLibrary.tsx`
  - `<colgroup>` 에 checkbox 열 추가, 헤더 select-all, `CaseListRow` 로 뽑을 만큼 크지 않으므로 기존 `<tr>` 에 `<td className="tct-check">` 추가 (`CaseListRow.tsx` 는 팔레트용이라 건드리지 않는다).
  - 선택 bar 컴포넌트 `CaseSelectionBar.tsx` (건수, 해제, 삭제, 상한 안내).
  - 삭제 `ConfirmActionDialog`: 제목에 건수, 본문에 "되돌릴 수 없고 이 test case 를 담은 시나리오에서도 빠진다".
  - 필터가 바뀌면 hook 이 prune.
- [x] **Step 5: i18n** `testCases.ts` en/ko 에 `selection`, `bulkDelete` 블록.
- [x] **Step 6: CSS** `App.css` 에 `.tct-check`, `.tcl-selection-bar` (semantic token, focus ring, 32px target).
- [x] **Step 7: Tests**
  - `testCaseSelection.test.ts`: 토글, 상한, 전체 선택/해제, indeterminate 판정, prune(같은 참조·줄어드는 경우), 필터 변경 시나리오(`selectTestCases` 결과와 조합).
  - `testCaseApi.test.ts`: `fetch` mock 으로 URL/method/body, `deleted` 파싱, 4xx 에서 `ProjectApiError`.
- [x] **Step 8: 검증/PR** `npm test`, `npm run typecheck`, `npm run build`, `npx eslint <changed>`.

## Validation
- **Commands to run:** `npm test`, `npm run typecheck`, `npm run build`, `npx eslint <changed files>`
- **Expected output:** 모두 0 exit, 새 테스트 통과.
- **Manual:** 서버 API 가 merge 되지 않아 실행 중인 stack 으로 screenshot 을 만들 수 없다. PR 에 그 사실을 적는다.

## Risks & Rollback
- **Risks:** (1) 서버 계약이 바뀌면 `bulkDeleteTestCases` 한 곳만 고친다. (2) 표에 열이 늘어 좁은 화면에서 step 열이 줄어든다. (3) render 중 setState 패턴은 잘못 쓰면 무한 render 가 되므로 prune 이 참조 동일성을 지키는 것을 테스트로 고정한다.
- **Rollback steps:** `git revert` — 새 파일과 `TestCaseLibrary.tsx` 일부만 바뀐다.

## Open Questions
- 없음. 500건 상한 처리는 위 결정 1 로 정했다.

## Plan review outcome (fast / medium / heavy)

- 수용: Enter guard 범위, Space 규칙 삭제, `stopPropagation`, `refresh` 와 `removeCases`, 삭제 뒤 focus 와 announcement, `children` slot 제거, API 입력 검사, 정렬 순서 명시, `aria-describedby`.
- 수용: CSS 열 너비는 `col.tct-c-check` 36px, step 30% -> 26%.
- 거절: `limitReached` 제거 — 안내 문구가 읽는다.
- 서버 확인이 필요한 문구("시나리오에서도 빠진다")는 기존 단건 삭제 문구와 같은 엔티티이므로 그대로 쓴다.

## Pair review outcome

- 수용: `refresh` 의 늦은 응답 버리기, 해제·삭제 뒤 focus 를 render 후 effect 로 복원(목록이 비면 panel), 삭제 건수 fallback, `MAX_BULK_SELECTION` 을 `testCaseTypes.ts` 로 이동, `removeCase` 를 `removeCases` 위에 정의, 필터가 아무것도 숨기지 않을 때 같은 Set 을 돌려주는 테스트 추가.
- 수용하지 않음: 선택 bar 의 `role="status"` 가 처음 mount 될 때 읽히지 않을 수 있다는 지적 — 건수는 화면에 보이고 행 checkbox 가 자기 상태를 읽는다. 상시 live region 은 후속으로 미룬다.
- 수용하지 않음: key routing 을 순수 함수로 빼서 테스트 — 이 repo 에 component test 환경이 없고, 분기가 4줄이라 추출이 YAGNI 에 더 가깝다. 수동 검증도 서버 부재로 못 했다는 것을 PR 에 적는다.

## Pair review outcome (range selection)

- 수용: Shift+화살표는 Ctrl, Alt, Meta 가 함께 눌리면 가로채지 않는다. Shift mousedown 의 `preventDefault` 와 focus 는 왼쪽 button 일 때만. 목록 아래 줄에 선택 조작 안내를 더했다.
- 수용된 특징: 범위가 500건을 넘으면 "보이는 순서의 앞 500건" 이라서 시작점이 범위의 아래쪽 끝일 때 시작점 줄이 빠진다(계약 그대로, `selectRange` 의 상한 테스트가 고정한다).
- 수용된 특징: Shift+checkbox click 은 범위를 잇지 않고 그 줄만 토글한다(계약의 "checkbox click 은 지금처럼").
- 수용하지 않음: component 테스트(DOM 환경 없음). Delete 안내 문구와 guard 선택자는 코드 검토로만 확인했다.
