# 2026-09-01 — 기획서 목록에서 문서를 지운다

- Date: 2026-09-01
- GitHub Issue: None (Jira ARTEL-729)
- Status: Implemented

## Goal

`DocumentPanel` 의 문서 한 줄마다 삭제를 붙인다. 누르면 그 자리에서 확인을 받고, 확인하면
`DELETE /api/projects/:projectId/documents/:documentId` 를 불러 그 줄을 목록에서 없앤다.

## Non-goals

- 지운 문서의 복원
- 지식 화면에서의 삭제
- 여러 문서 한 번에 지우기

## Context / Constraints

계약은 ARTEL-728 이 정한다. `DELETE /api/projects/:projectId/documents/:documentId`,
요청 body 없음, 성공 204 No Content, 없거나 접근 못 하면 404 `not_found`.

문서 목록 상태는 `useProject` 가 들고 `workspaceContext` 로 내려온다. 업로드가
`applyNewDocument` 로 앞에 끼워 넣으므로, 삭제도 같은 자리에 짝이 되는 함수를 둔다.

삭제는 되돌릴 수 없고 그 문서에서 나온 지식까지 사라지므로, 확인 없이 지우지 않는다.
`window.confirm` 대신 그 줄 안에서 확인을 받아 화면 밖으로 나가지 않게 한다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `DocumentPanel.tsx`, `projectApi.ts`, `useProject.ts`,
      `workspace/workspaceContext.ts`, `workspace/DocumentsSection.tsx`,
      `i18n/messages/projects.ts`, `.agents/docs/DESIGN.md`
- [x] **Step 1: API 함수** — `projectApi.ts` 에 `deleteDocument(projectId, documentId): Promise<void>`
      를 더한다. 204 라 body 를 읽지 않는다.
- [x] **Step 2: 상태** — `useProject` 에 `applyRemovedDocument(documentId)` 를 더한다.
      `documents` 에서 그 항목을 빼고, `project.document` 가 그것이었으면 남은 첫 문서로 바꾼다.
      `workspaceContext` 와 `DocumentsSection` 이 그것을 내려보낸다.
- [x] **Step 3: 화면** — `DocumentLine` 에 삭제 버튼을 붙인다. 누르면 그 줄이 확인 모양으로
      바뀌어 되돌릴 수 없다는 것과 지식도 사라진다는 것을 말하고, 확인과 취소를 준다.
      진행 중에는 버튼을 비활성화하고, 실패하면 그 줄에 오류를 남기고 목록은 그대로 둔다.
      성공은 이미 있는 `aria-live` 영역으로 알린다.
- [x] **Step 4: 문구** — `i18n/messages/projects.ts` 의 모든 locale 에 새 문구를 넣는다.
- [x] **Step 5: 스타일** — 삭제 버튼과 확인 줄에 필요한 token 을 `DESIGN.md` 에서 가져온다.
      파괴적 동작의 색은 danger 계열 semantic token 을 쓴다. `.button--danger` 와
      `.button--danger-quiet` 는 이미 있어 그대로 재사용했다.
- [x] **Step 6: Tests** — 확인 없이는 요청이 나가지 않는다 / 확인하면 줄이 사라진다 /
      실패하면 목록이 그대로다.

## Validation

- **Commands to run:** `npm run typecheck`, `npm run lint`, `npm run test`
- **Result:** `typecheck` 는 오류 없음. `test` 는 259개 전부 통과 (fail 0). `lint` 는
  9 error / 2 warning 이 남아 있지만 전부 `RunListPanel.tsx`, `RunNameCrumb.tsx`,
  `TestScenarioPage.tsx`, `useStepEditor.ts`, `RunMapPage.tsx` 에서 나며, 이번
  변경이 건드린 파일 목록에는 없다 — 이 작업 전부터 있던 lint 부채다.

## Risks & Rollback

- **Risks:** 되돌릴 수 없는 동작이라 확인 단계가 유일한 방어선이다. 확인 문구가 지식까지
  사라진다는 것을 반드시 말해야 한다.
- **Rollback steps:** `git revert`

## Open Questions

- 없음
