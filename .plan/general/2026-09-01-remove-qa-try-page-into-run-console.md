# 2026-09-01 — home-QA Try 화면을 지우고 QA Run 콘솔로 모은다

- Date: 2026-09-01
- GitHub Issue: None
- Jira: ARTEL-723
- Status: Draft

## Goal

Delete `QaTryPage` (`/projects/:projectId/qa-tries/:qaTryId`) and route every
entry point that used to open it into `QaRunPage`'s console
(`/projects/:projectId/qa-runs/:qaRunId?try=:qaTryId`) instead, without losing
the three things only `QaTryPage` had: the stream connection state line, the
load-failure retry button, and the loaded-log count.

## Non-goals

- Adding per-scenario cancel to the console (`cancelQaRun` stands in).
- Touching `qaApi.createQaTry`, which this change does not orphan.
- Reworking the console's layout.

## Context / Constraints

- Depends on `ARTEL-722` (backend), which lands `qaRunId` / `createdByQaRunId`
  on `QaTryResponse`, `IssueResponse`, and the knowledge graph node. Not merged
  yet — this branch must parse the field defensively (`null` on absence or a
  malformed value, never a thrown parse failure) so the UI degrades to a grey,
  non-interactive row until the backend ships.
- `QaRunPage` already owns `focusTry` / `following` / `pinnedTryId`; only the
  URL seed (`?try=`) is new.
- `useQaTry` already exposes `streamState` and `reload`; `FocusedTry` just
  needs to read them.
- A sixth link site was found that the issue does not list:
  `src/qa/QaTryPanel.tsx:309` (the "recent runs" list in the QA start panel).
  Since removing the route turns this into a dead link too, it is in scope —
  fixed with the same run-id-or-muted-row treatment as the other five.

## Approach (Checklist)

- [x] **Step 0: Recon**
  - Read `QaRunPage.tsx`, `QaTryPage.tsx`, `useQaTry.ts`, `qaApi.ts`,
    `qaTypes.ts`, the five listed link sites, `IssueList.tsx` / `IssueRow.tsx`
    / `QaTryIssuePanel.tsx`, `knowledgeApi.ts` / `knowledgeTypes.ts`, and
    `App.css` line ranges for `.qa-page*` / `.qa-workspace` /
    `.qa-stream-panel` / `.qa-log-panel`.
  - Confirmed `.qa-log-header` / `.qa-log-count` are used only inside the
    deleted `.qa-log-panel` markup — orphaned by this change even though the
    issue does not name them, so they are deleted too and replaced by new
    `.qa-focus-*` classes for the console's own log-count/stream-state line.
  - Confirmed `cancelQaTry` and `CancelQaTryDialog` have no other callers.
  - Confirmed `t.qa.cancel.*` i18n keys become unused once both callers are
    deleted — removed as a direct consequence of this deletion, not a sweep.

- [ ] **Step 1: Contract — `qaRunId` / `createdByQaRunId`**
  - `src/qa/qaTypes.ts`: add `qaRunId: string | null` to `QaTry`.
  - `src/qa/qaApi.ts`: `parseQaTry` parses it with the existing `optionalId`
    helper (same style as the sibling `agentSessionId` field). Delete
    `cancelQaTry`.
  - `src/issues/issueTypes.ts`: add `qaRunId: string | null` to `Issue`.
  - `src/issues/issueApi.ts`: `parseIssue` parses it with `isDecimalId(...) ?
    value : null`, matching the file's existing required-id style.
  - `src/knowledge/knowledgeTypes.ts`: add `createdByQaRunId: string | null`
    to `KnowledgeNode`, alongside the existing `createdByQaTryId`.
  - `src/knowledge/knowledgeApi.ts`: `parseKnowledgeNode` parses it with
    `asNullableString`, matching the sibling `createdByQaTryId` parse in the
    same file.

- [ ] **Step 2: Shared route helper**
  - Add `qaRunPath(projectId, qaRunId, qaTryId?)` to `src/qa/qaTypes.ts` (pure,
    alongside `isTerminalQaStatus`) building
    `/projects/:projectId/qa-runs/:qaRunId` with an optional `?try=` query, so
    the six call sites do not each hand-encode the same URL.

- [ ] **Step 3: `QaRunPage` seeds from `?try=`**
  - `QaRunRoute`/`QaRunPage` reads `useSearchParams()` for `try`. When present
    and it names a scenario in `run.tries`, seed `pinnedTryId` with it and
    start `following = false`. Otherwise keep today's default (`following =
    true`, `pinnedTryId = null`).
  - The follow button keeps its current behavior unchanged.

- [ ] **Step 4: Carry the three `QaTryPage`-only things into `FocusedTry`**
  - Load failure: when `session.loadStatus === 'error'`, render a
    `panel-message` with a retry button calling `session.reload()`, ahead of
    the existing `session.qaTry === null` loading branch.
  - Stream state line: derive the same `streamLabel` from `session.streamState`
    (offline/degraded/connecting/live) and show it, `aria-live="polite"`, next
    to the log tabs — only while the try is active (ended tries already say so
    via the existing `endedGame` copy).
  - Log count: show `session.logs.length` next to the tabs, mirroring the old
    `{n} loaded` line.
  - New strings go in `src/i18n/messages/qa.ts` under `run.*` (English +
    Korean), reusing `t.qa.panel.retry` for the retry button label rather than
    adding a duplicate "Retry" string.
  - New CSS: `.qa-focus-logs-meta`, `.qa-focus-stream-state`,
    `.qa-focus-logs-count` (small, muted, `tabular-nums`, matching the removed
    `.qa-log-count`'s look).

- [ ] **Step 5: Route removal**
  - `src/App.tsx`: delete the `/projects/:projectId/qa-tries/:qaTryId` route
    and the `QaTryRoute` import.

- [ ] **Step 6: Rewrite the six link sites**
  - `QaHistorySection.tsx:90`, `DashboardSection.tsx:124`, `:150`,
    `KnowledgeInspector.tsx:213`, `QaTryPanel.tsx:309`: each becomes
    `qaRunPath(projectId, run id, try id)` when the run id is not null, and a
    plain non-interactive muted `<span>` with the same label text otherwise
    (`--color-text-muted` token, no link, no `href`).
  - `IssuesSection.tsx:85` / `IssueList.tsx` / `IssueRow.tsx`: change the
    `qaTryHref: ((qaTryId: string) => string) | null` prop to
    `runHref: ((qaRunId: string, qaTryId: string) => string) | null`.
    `IssueRow` calls it only when `issue.qaRunId !== null`; otherwise renders
    the muted span. `null` itself keeps meaning "no link at all" (used by
    `QaTryIssuePanel`, which is already inside the run and needs neither state).
  - `KnowledgeInspector.tsx`: keep the existing "extracted from a document"
    branch for `createdByQaTryId === null`; add a second muted branch for
    `createdByQaTryId !== null && createdByQaRunId === null`.

- [ ] **Step 7: Delete the old screen**
  - Delete `src/qa/QaTryPage.tsx`, `src/qa/QaStepStrip.tsx`,
    `src/qa/CancelQaTryDialog.tsx`.
  - Delete `cancelQaTry` from `qaApi.ts` (done in Step 1).
  - Delete the now-unused `t.qa.cancel.*` block from `src/i18n/messages/qa.ts`.
  - Delete `.qa-page`, `.qa-page-header`, `.qa-page-header h1 .mono`,
    `.qa-workspace`, `.qa-page--active .qa-workspace`,
    `.qa-page--terminal .qa-workspace`, `.qa-stream-panel` (+ its
    `.game-stream` child rule), `.qa-log-panel`, `.qa-log-header` (+ its `h2`/`p`
    children), `.qa-log-count`, and the `@media (max-width: 1023px)` block that
    holds only old-screen rules, from `src/App.css`.
  - Grep for every deleted class/function name before removing it.

- [ ] **Step 8: Tests**
  - `src/qa/qaApi.test.ts`: add a `parseQaTry` case covering `qaRunId` present,
    absent, and malformed (non-decimal).
  - `src/issues/issueApi.test.ts` (new, following the `qaApi.test.ts` pattern —
    no test file exists for `issueApi.ts` yet): `parseIssue` case for
    `qaRunId` present/absent/malformed. Add only if the smallest test fits;
    otherwise extend an existing suite if one is found during implementation.
  - `src/knowledge/knowledgeApi.test.ts`: extend the existing sample/assertions
    to include `createdByQaRunId`, plus the missing-field case.

## Validation

- **Commands to run:** `npm run lint`, `npm run typecheck`, `npm run build`.
- **Manual/structural check:** grep for `qa-tries`, `QaTryPage`, `QaStepStrip`,
  `CancelQaTryDialog`, `cancelQaTry`, `.qa-page`, `.qa-workspace`,
  `.qa-stream-panel`, `.qa-log-panel`, `.qa-log-header`, `.qa-log-count` after
  the deletions — every hit must be gone or intentionally unrelated.
- **Expected output:** all three commands exit 0; no leftover references.

## Risks & Rollback

- **Risks:** `ARTEL-722` has not merged, so `qaRunId` cannot be exercised end
  to end against a live server yet — every degrade-to-null path is validated
  by unit test and by code review, not by a live 5-entry-point walkthrough.
  The sixth link site (`QaTryPanel.tsx`) is an addition beyond the issue's
  acceptance criteria; flagged in the PR body so a reviewer can confirm the
  call.
- **Rollback steps:** revert the PR commit(s); the old screen's files are
  recoverable from git history alone (`git show <sha>:src/qa/QaTryPage.tsx`).

## Plan Review

A fast+medium review pass (general-purpose subagent, read-only) found two
must-fix issues and four should-fix issues, folded in before/while
implementing:

- **Must-fix — seed re-application:** the review worried a `?try=` seed
  implemented as an effect keyed on `run` would re-fire on every 3-second poll
  and fight the operator's own "Follow" clicks. Resolved by design: the seed is
  a `useState` initializer on `pinnedTryId`/`following`, driven by a `key` on
  `QaRunPage` that includes both `qaRunId` and the initial try id — it runs once
  per distinct `(run, try)` navigation, never on a poll tick (polling only calls
  `setRun`).
- **Must-fix — `createdByQaRunId` validation:** the plan's original "match
  `knowledgeApi.ts`'s existing style" (`asNullableString`, like the sibling
  `createdByQaTryId`) would let a malformed value flow into `qaRunPath` and
  build a broken link instead of degrading to the muted row. Changed to
  `isDecimalId(...) ? value : null` (imported from `qaApi.ts`, matching the
  stricter validation `QaTry.qaRunId` and `Issue.qaRunId` already use), with a
  comment explaining the deliberate divergence from the sibling field.
- **Should-fix — muted-row copy at two sites:** `IssueRow` and
  `KnowledgeInspector` show an action-verb label ("Open the run" / "런 열기");
  freezing that into inert grey text reads as a broken button rather than
  absent data. Added `t.issues.row.noRun` ("No run linked yet" / "아직 연결된
  실행 없음") and `t.knowledge.inspector.noRunYet` ("Not yet linked to a run" /
  "아직 런과 연결되지 않음") for those two muted branches specifically. The
  other four sites show a bare `#id`, where the same text muted is correct as
  originally planned.
- **Should-fix — muted styling underspecified:** resolved with concrete classes
  — `.table-link--muted`, `.qa-try-link--muted`, `.issue-row-link--muted` (new,
  `color: var(--color-text-muted)`), and `KnowledgeInspector` reuses its
  existing `.detail-empty` class (already used for the sibling
  "extracted from a document" branch).
- **Should-fix — test guidance hedging:** tightened; `src/issues/issueApi.test.ts`
  is created directly, no existing suite to extend.
- **Should-fix — CSS deletion rationale:** confirmed the `@media (max-width:
  1023px)` block being deleted only affects the old screen: its
  `.qa-log-viewport { max-height: 620px }` rule is bare-selector and would in
  principle reach the console too, but the console's own
  `.qa-focus-logs-body .qa-log-viewport { max-height: none }` (unconditional,
  higher specificity) already wins at every width, so deleting the media block
  changes no visible behavior.

Two nice-to-haves (keep `qaRunPath` in `qaTypes.ts`; keep `mono`/`translate="no"`
on the muted spans) were already the plan's intent and needed no change.

## Open Questions

- None blocking. The sixth link site is called out above rather than treated
  as a silent scope expansion.
