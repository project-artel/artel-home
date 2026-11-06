# 2026-08-28 — Project tracker link panel and issue export links

- Date: 2026-08-28
- GitHub Issue: None
- Jira: ARTEL-672 (slice of ARTEL-670, under epic ARTEL-669)
- Status: Draft

## Goal

Add a project-settings panel that lets a project owner connect the project to
a GitHub repository (via the GitHub App install flow) and pick an auto-export
severity threshold, and show — in the project issue list — whether each
defect has been exported to that repository, with retry for failures and a
manual export action for defects that did not qualify automatically.

The server contract (implemented concurrently by another worker against
ARTEL-671, not yet merged) is treated as frozen:

- `GET /api/projects/:projectId/tracker-link` → `200 {"link": TrackerLink | null}`
- `PUT /api/projects/:projectId/tracker-link` — body `{"provider","workspace","repository","autoSyncSeverities"}` → `200 {"link": TrackerLink}`. Owner-only (403 for a member, 404 for a non-member).
- `DELETE /api/projects/:projectId/tracker-link` → `204`
- `GET /api/projects/:projectId/tracker/github/install-url` → `200 {"url": string}`
- `GET /api/projects/:projectId/tracker/github/repositories` → `200 {"items": [{"workspace","repository","htmlUrl","private"}]}`
- `POST /api/issues/:issueId/tracker-sync` → `202 {"tracker": IssueTracker}`

`TrackerLink` = `provider` ("GITHUB"), `installed` (boolean), `workspace`
(string|null), `repository` (string|null), `htmlUrl` (string|null),
`autoSyncSeverities` (string[]), `updatedAt` (string).

`IssueTracker` = `provider`, `externalKey` (string|null), `url` (string|null),
`syncState` ("PENDING"|"SYNCED"|"FAILED"), `syncError` (string|null),
`syncedAt` (string|null).

`IssueResponse` gains a `tracker` field: `IssueTracker | null`.

**Contract note carried into the PR report, not acted on unilaterally:** the
Story ARTEL-670 body names the PUT fields `repositoryOwner`/`repositoryName`,
while the task brief's frozen contract (written after that story, for this
concurrent build) names them `workspace`/`repository`. This plan follows the
frozen contract given for this build (`workspace`/`repository`), since it is
what the server worker is coding against right now. Flag as a contract
question in the PR rather than resolving it unilaterally.

## Non-goals

- Any Jira tracker UI. The provider type is a closed union of one value today
  (`'GITHUB'`), but every type, API function, and copy string carries
  `provider` as data rather than assuming GitHub, so a second provider is an
  addition, not a rewrite.
- A severity filter or tracker column on the issue list beyond the per-row
  export/link affordance already specified.
- Rendering GitHub issue body previews.
- Polling a `PENDING` sync state to completion. Per Step 4, no retry button
  renders while `syncState === 'PENDING'` (there is nothing to retry
  mid-flight), so a row that is genuinely stuck in `PENDING` — a lost
  webhook, a crashed server-side job — has no user-triggered fix in this
  build. A reload only reflects whatever the server still reports; it does
  not force re-evaluation. If this proves to matter in practice, a follow-up
  can add a manual re-check action; it is not built speculatively here.
- Tracker display inside `QaTryIssuePanel` (the run-detail issue list). That
  panel renders outside `ProjectWorkspace`'s route (`/projects/:projectId/qa-tries/:qaTryId`
  is a sibling top-level route, not nested under `ProjectWorkspaceRoute`), so
  it has no access to the workspace's `trackerLink` state without a separate
  fetch keyed off a `projectId` the panel does not currently receive. The task
  brief's examples all describe "the issue list" as the project-level list
  (`IssuesSection`); this plan treats that as the scope and leaves
  `QaTryIssuePanel` passing `trackerConnected={false}` (no tracker UI), noting
  this as a explicit scope call in the PR rather than a silent gap.
- A confirmation dialog for disconnect. The task brief says disconnect must
  not carry the visual weight of project deletion; this plan renders it as a
  plain secondary button with its own inline pending/error state, matching
  other single-click owner actions in this codebase (e.g. `GameInstancePanel`'s
  refresh), rather than reusing the `Dialog` modal used for delete flows.

## Context / Constraints

- `src/projects/projectApi.ts` already exports the tolerant-parsing
  vocabulary (`asRecord`, `asString`, `asNullableString`, `isOneOf`,
  `jsonRequest`, `readJson`, `toApiError`, `projectPath`) and `ProjectApiError`.
  New tracker API code reuses these as-is; no new error class, and new failure
  codes join the existing `CLIENT_*` convention (rendered through
  `apiErrorMessage`, which reads `t.projects.apiErrors` regardless of which
  domain module the code belongs to — `CLIENT_MALFORMED_INSTANCE` and
  `CLIENT_MALFORMED_BUILD` already do this for `gameApi.ts`).
- `Issue`/`IssueApi`/`IssueList`/`IssueRow` are shared between `IssuesSection`
  (inside the workspace, has `useWorkspace()`) and `QaTryIssuePanel` (outside
  it). New props on `IssueList`/`IssueRow` must stay required and explicit
  (`trackerConnected: boolean`) so each call site states its own answer rather
  than one silently defaulting.
- `useWorkspaceExtras.ts` already loads five things in one `Promise.all` so
  the dashboard and every section share one loading/error state
  (`runs`, `tries`, `models`, `openIssues`, `coverage`). Tracker link becomes
  a sixth: both `SettingsSection` (owns the connect/select/disconnect/severity
  UI) and `IssuesSection` (needs to know "is any repository connected" to
  decide whether to show tracker UI on a row at all) need it, so loading it
  once in the layout avoids two independent fetches and matches the existing
  "no per-section staggered spinner" rule.
- DESIGN.md's component catalogue (`ReplayViewport`, `EvidenceTimeline`, …)
  does not cover a settings/list feature like this one; the concrete UI in
  this repository already expresses DESIGN.md's tokens through the existing
  CSS classes (`panel`, `panel-header--split`, `badge`, `severity-tag`,
  `button--secondary`/`--primary`/`--danger-quiet`, `inline-error`,
  `detail-fields`, `instance-row`-style list rows). This plan reuses those
  classes and adds only the handful of new ones a repository-picker list and a
  severity-checkbox row need, keeping every new color reference a
  `var(--color-*)` token — never a literal hex value in TSX or new CSS.
- Query-param handling precedent already exists: `PerformanceSection.tsx` uses
  `useSearchParams` and calls `setSearchParams(..., { replace: true })` to
  rewrite the URL without adding a history entry. The tracker panel follows
  the same call shape to drop `?tracker=connected|failed` after reading it.

## Approach (Checklist)

### Step 0: Recon (done during planning)

- Read `.agents/docs/{project,workflow,testing,coding-style,DESIGN,issue,commit,pull-request}.md`.
- Read ARTEL-672/670/669 in Jira.
- Read `src/projects/{projectApi,projectTypes}.ts`, `workspace/{SettingsSection,workspaceContext,useWorkspaceExtras,IssuesSection}.tsx`, `src/projects/useProject.ts`, `src/projects/GameInstancePanel.tsx`, `src/projects/DeleteProjectDialog.tsx`.
- Read `src/issues/{issueApi,issueTypes,IssueRow,IssueList,useIssues,useIssueResolution,QaTryIssuePanel}.tsx`.
- Read `src/i18n/messages.ts` and `src/i18n/messages/{issues,projects}.ts` for the localization convention (`Localized<T>` type, `en`/`ko` pair per domain file).
- Read `src/App.tsx` for routing (confirms `QaTryIssuePanel`'s route sits outside `ProjectWorkspaceRoute`).
- Read the relevant `App.css` blocks (`panel*`, `badge`, `severity-tag`, `instance-*`, `field*`, `run-del-option` checkbox pattern) to reuse existing classes and tokens.

### Step 1: Shared tracker domain module (`src/tracker/`)

New files:

- `src/tracker/trackerTypes.ts`
  - `TRACKER_PROVIDERS = ['GITHUB'] as const`, `TrackerProvider` union, `isTrackerProvider`.
  - `TRACKER_SYNC_STATES = ['PENDING', 'SYNCED', 'FAILED'] as const`, `TrackerSyncState` union.
  - `TrackerLink`, `TrackerRepository`, `IssueTracker`, `TrackerLinkDraft` (the PUT body shape) types.
  - `DEFAULT_AUTO_SYNC_SEVERITIES: IssueSeverity[] = ['BLOCKER', 'CRITICAL']`, imported by both the panel (initial pick) and any doc/test that needs the default.
  - Imports `IssueSeverity`/`ISSUE_SEVERITIES` from `../issues/issueTypes` (type-only for the union; the array for lenient filtering). This creates `tracker -> issues/issueTypes`, and separately `issues/issueApi -> tracker/trackerApi`; no cycle since `issueTypes.ts` does not import `tracker`.
- `src/tracker/trackerApi.ts`
  - `parseTrackerLink(data: unknown): TrackerLink | null` — returns `null` when the record is missing or `provider` is not a known value (degrade to "nothing to show" rather than throw, matching "모르는 값은 버리고 없는 값은 없는 대로 그린다"). A real connection to a provider this build does not know (e.g. a future `JIRA` link read by an old client) degrades to the same "not connected" state 1 in the settings panel — the connection is real on the server but invisible here until the client is updated to recognize that provider. This is the accepted, deliberate behavior of the tolerant-parsing convention, not a gap.
  - `parseIssueTracker(data: unknown): IssueTracker | null` — same degrade-to-null rule, exported for `issueApi.ts` to call from `parseIssue`.
  - `parseTrackerRepositoryList(data: unknown): TrackerRepository[]` — tolerant list parse like `parseDocumentList` (drop unparseable rows, never throw).
  - `getTrackerLink(projectId, signal?)` → `GET /tracker-link`, unwraps `{link}`.
  - `updateTrackerLink(projectId, draft: TrackerLinkDraft)` → `PUT /tracker-link`; throws `ProjectApiError(..., 'CLIENT_MALFORMED_TRACKER_LINK')` if the response's `link` cannot be parsed (this call must return a usable value — unlike the GET, there is nothing sensible to degrade to after a write the caller is waiting on).
  - `deleteTrackerLink(projectId)` → `DELETE /tracker-link`, throws via `toApiError` on non-2xx.
  - `getTrackerInstallUrl(projectId, provider)` → `GET /tracker/github/install-url` (provider-to-path mapping is a one-entry `Record<TrackerProvider, string>` lookup, not a hardcoded literal at the call site); throws `CLIENT_MALFORMED_INSTALL_URL` if `url` is missing. This lookup table is justified by the same "provider is data, not a hardcoded branch" stance every tracker function already takes (each one threads a `provider` parameter it does not yet need to branch on) — it is not anticipated Jira work, and it is not a registry/strategy pattern; it is one `Record` literal with one entry today.
  - `listTrackerRepositories(projectId, provider, signal?)` → `GET /tracker/github/repositories`.
  - `syncIssueTracker(issueId)` → `POST /api/issues/:issueId/tracker-sync`; throws `CLIENT_MALFORMED_TRACKER_SYNC` if the response's `tracker` cannot be parsed. The `202` status is treated as carrying the authoritative current `IssueTracker` in its body regardless of status code semantics — this client does not distinguish "accepted and here is the result" from "accepted and still working," since `IssueTracker.syncState` already says which one it is (`PENDING` for the latter). Whatever `syncState` comes back is applied directly to the row (Step 4); there is no second read to confirm it.
  - All functions built on `apiFetch`/`asRecord`/`asNullableString`/`asString`/`isOneOf`/`jsonRequest`/`readJson`/`toApiError`/`projectPath`/`ProjectApiError` imported from `../projects/projectApi` and `../auth/authApi`. No new error type.

### Step 2: Wire the tracker link into the workspace (`useWorkspaceExtras.ts`, `workspaceContext.ts`)

- Add `trackerLink: TrackerLink | null` to `Extras`/`empty` and to the
  `Promise.all` in the loading effect (`getTrackerLink(projectId, signal)`).
  A failed initial load already funnels into the existing `extrasStatus:
  'failed'` path — no new failure state needed.
- Add `applyTrackerLink: (link: TrackerLink | null) => void` next to the other
  `apply*`-style setters, so the settings panel can push the result of a
  connect/select/disconnect/severity-change mutation into shared state without
  a second round-trip.
- Extend `WorkspaceValue` in `workspaceContext.ts` with `trackerLink` and
  `applyTrackerLink`, and thread both through `ProjectWorkspace.tsx`'s
  `value` memo (and its dependency array).

### Step 3: Issue types and parsing (`src/issues/issueTypes.ts`, `issueApi.ts`)

- Add `tracker: IssueTracker | null` to `Issue`.
- In `issueApi.ts`'s `parseIssue`, set `tracker: parseIssueTracker(record.tracker)`
  (imported from `../tracker/trackerApi`). `record.tracker` being `undefined`
  (server not shipping the field yet) already reads as `null` through
  `asRecord`/`parseIssueTracker`'s existing null-record branch — no extra
  guard needed, which is the acceptance criterion "서버가 아직 tracker 필드를
  주지 않아도 화면이 깨지지 않는다" satisfied by the existing tolerant-parsing
  shape rather than a special case.

### Step 4: Issue list tracker UI (`src/issues/{IssueList,IssueRow}.tsx`, `src/issues/IssueTrackerStatus.tsx`, `src/issues/useIssueResolution.ts`, new `src/tracker/useTrackerSync.ts`, `src/projects/workspace/IssuesSection.tsx`)

- Export the `Patch` type from `useIssueResolution.ts` (currently declared
  there but not exported) instead of re-declaring an identical shape in the
  new hook. `src/tracker/useTrackerSync.ts` imports it from there.
- `useTrackerSync(patch: Patch)`: same shape as `useIssueResolution` —
  `pending: ReadonlySet<string>`, `failedId: string | null`, `sync(issue)`
  that calls `syncIssueTracker`, patches `issue.tracker` with the response on
  success, and sets `failedId` without touching the row's data on a thrown
  error (mirrors the existing optimistic-update/rollback shape, but there is
  nothing to roll back here — the row simply keeps showing whatever `tracker`
  value it already had).
- `IssueList` gains a required `trackerConnected: boolean` prop, instantiates
  `useTrackerSync(patch)` unconditionally (rules of hooks), and passes
  `trackerConnected`, `onSync`, `syncPending={pending.has(issue.id)}`,
  `syncFailed={failedId === issue.id}` to each `IssueRow`.
- `IssuesSection.tsx` reads `trackerLink` from `useWorkspace()` and passes
  `trackerConnected={trackerLink !== null && trackerLink.repository !== null}`
  to `IssueList` (this was missing from the first draft of this plan — the
  workspace-level `trackerLink` added in Step 2 exists specifically so this
  call site does not need its own fetch).
- New presentational component `src/issues/IssueTrackerStatus.tsx`, following
  the precedent `SeverityTag` already sets for pulling one row-level concern
  out of `IssueRow`'s render body rather than growing a further inline branch
  there. It owns only the **read-only** tracker facts — not the export/retry
  button, since that button lives in a different part of the row's markup
  (`issue-row-actions`, not `issue-row-meta`) and a single component instance
  cannot usefully render into two separate sibling `<div>`s. Props: `tracker:
  IssueTracker | null`. Rendering, only rendered from `IssueRow` when
  `trackerConnected` is true, placed inside the existing `issue-row-meta` div
  (after `reportedAt`/`step`/`resolvedAt`, before the `qaTryHref` link, so the
  tracker's read-only facts sit with the row's other read-only facts):
  - `tracker === null` → renders nothing (the meta line has nothing to add
    yet; the actions row below carries the "Export" button for this case).
  - `tracker.syncState === 'PENDING'` → a muted inline label
    ("Syncing…"/"동기화 중…").
  - `tracker.syncState === 'SYNCED'` → a link chip: `{providerLabel}
    #{externalKey}` as an `<a target="_blank" rel="noopener noreferrer"
    href={tracker.url}>`, plus the export timestamp when present (mirrors the
    existing `resolvedAt` treatment).
  - `tracker.syncState === 'FAILED'` → a failure label; if the server sent
    `syncError`, render it verbatim alongside (server text is not localized,
    matching how `apiErrorMessage` treats a server-provided message). The
    "Retry" action itself is the same button described below, not part of
    this component.
- `IssueRow`'s export/retry button lives directly in the existing
  `issue-row-actions` div (a two-line conditional next to the existing
  resolve/reopen ternary, not a separate component — one button with one
  label swap does not carry its own weight as a component the way the
  multi-branch meta display does): shown when `trackerConnected` is true and
  either `issue.tracker === null` or `issue.tracker.syncState === 'FAILED'`
  (no button while `PENDING` — nothing to retry mid-flight — or `SYNCED` —
  the link chip is the whole story). Label is `t.tracker.row.exporting` while
  `syncPending` is true, else `t.tracker.row.export` when `tracker === null`,
  else `t.tracker.row.retry`. Placed before the existing show/hide-detail
  button, so the row's "act on the server" affordances (export/retry,
  resolve/reopen) group ahead of the local-only detail toggle.
- A request that itself throws (network/5xx from `syncIssueTracker`, as
  opposed to a successfully-returned `FAILED` `syncState`) renders a second
  `.issue-row-error` paragraph — alongside the existing one used for resolve
  failures — with the existing `t.issues.row.failed` copy, reused rather than
  duplicated since the meaning ("that change could not be saved, nothing
  changed") is identical to the resolve-toggle failure case. `IssueRow`
  already has one `{failed ? <p className="issue-row-error" ...> : null}`
  block for the resolve toggle; the tracker one is a second, independent
  instance of the same shape driven by the new `syncFailed` prop, since the
  two failures are unrelated actions that can each be true independently.
- `QaTryIssuePanel.tsx` passes `trackerConnected={false}` (see Non-goals) — a
  one-line, explicit change, not a silent gap.

### Step 5: Settings tracker panel (`src/tracker/TrackerLinkPanel.tsx`, `SettingsSection.tsx`)

New component `TrackerLinkPanel`, rendered inside `SettingsSection.tsx`'s
`section-columns` between the general-info panel and the danger-zone panel.
Reads `projectId`, `project.myRole`, `trackerLink`, `applyTrackerLink` from
`useWorkspace()`.

State derivation from `trackerLink` (no separate "which of 3 states" flag —
derived every render), keyed **only** on `repository` presence, not on the
`installed` boolean: `trackerLink === null` is state 1;
`trackerLink !== null && trackerLink.repository === null` is state 2
regardless of what `installed` says; `trackerLink.repository !== null` is
state 3. `installed` is carried in the type (the server may use it
internally) but the client does not branch on it — a row that is
`installed: false` with no repository still renders as "pick a repository",
and if that picker's `listTrackerRepositories` call then fails or returns
empty, the existing repository-list error/empty states already say so; no
separate "not actually installed" UI is needed on top of that.

1. `trackerLink === null` → **Not connected.**
   - Owner: intro copy + "Connect to GitHub" button. `onClick` calls
     `getTrackerInstallUrl(projectId, 'GITHUB')` and, on success,
     `window.location.assign(url)` (full-page navigation, not a new tab — the
     GitHub App install flow redirects back to this same page). On failure,
     an inline error with the button re-enabled.
   - Member: quiet text, no button.
2. `trackerLink !== null && trackerLink.repository === null` → **Installed,
   no repository chosen.**
   - Owner: a repository picker. A `useEffect` keyed on entering this state
     fetches `listTrackerRepositories(projectId, 'GITHUB')` once (guarded by a
     "have we already fetched for this link" local flag, not by
     `trackerLink` object identity, since `applyTrackerLink` after another
     mutation could otherwise refetch needlessly). Renders each repository as
     a row (`workspace/repository`, a "Private" badge when `private`, a
     "Connect" button) — clicking one calls `updateTrackerLink(projectId,
     {provider:'GITHUB', workspace, repository, autoSyncSeverities:
     DEFAULT_AUTO_SYNC_SEVERITIES})` and `applyTrackerLink`s the result.
     Loading/empty/error states for the repository list follow the same
     shape as `GameInstancePanel`'s refresh failure banner.
   - Member: quiet text ("waiting for the owner"), no fetch, no picker.
3. `trackerLink !== null && trackerLink.repository !== null` → **Connected.**
   - Shows `workspace/repository` as text, plus a link to `htmlUrl` (new tab)
     when present.
   - Auto-sync severities: `ISSUE_SEVERITIES` (worst-first, matching the
     existing severity ladder) rendered as a checkbox per severity, labelled
     via `t.issues.severityLabels`. Owner: interactive; toggling one severity
     immediately calls `updateTrackerLink` with the same provider/workspace/
     repository and the updated severity array, disabling the checkbox group
     while the save is in flight (no debounce — this list is short and a
     second click while disabled cannot happen). Each checkbox's `checked`
     is read directly from `trackerLink.autoSyncSeverities` (there is no
     local draft copy of the severity set), so a failed save needs no
     explicit rollback: `applyTrackerLink` is only called on success, and
     re-enabling the checkbox group after a failure already shows the
     last-good server state on its own. On failure, an inline error
     (`t.tracker.panel.severitySaveFailed`) renders below the checkbox list
     alongside re-enabling it. Member: rendered as static
     `badge`/`severity-tag`-styled read-only chips, no `<input>` elements.
   - Owner-only "Disconnect" button (`button--secondary`, not `--danger*` —
     see Non-goals): calls `deleteTrackerLink`, then `applyTrackerLink(null)`
     on success. A `panel-note`-styled line states that already-exported
     issues are unaffected (mirrors ARTEL-670's stated behavior).

Redirect-return handling (own `useEffect`, runs for owner and member alike
since a member could also land back on the settings page mid-flow, though
only an owner can have started it):

- Read `?tracker=connected|failed` via `useSearchParams`.
- On either value: remove the `tracker` param via
  `setSearchParams(next, { replace: true })` (same call shape as
  `PerformanceSection.tsx`) so a reload cannot repeat the announcement, then
  set a local `notice: 'connected' | 'failed' | null` for the panel's own
  inline message and `aria-live` announcement.
- On `'connected'`: also call `reloadExtras()` from `useWorkspace()` so
  `trackerLink` (now installed, possibly still repository-less) is re-read
  from the server rather than staying at whatever the layout loaded before
  the redirect.
- On `'failed'`: no reload — nothing changed server-side.

**Who owns the redirect itself, and where "home" means:** per ARTEL-670's
description of the orchestration-server side of this contract, the GitHub
App's own redirect target is a server endpoint (`GET
/api/tracker/github/setup`), not this page — the server verifies a signed
`state`, stores the `installation_id`, and redirects the browser "홈으로"
("back to home"). Read literally against this app's own routing, that phrase
is ambiguous: `App.tsx` has no `/home` route — `/` itself redirects to
`/projects`, the project list, not the settings page this flow started from.
"Home" in ARTEL's own vocabulary is also the name of this repository/product
(`artel-home`, as opposed to `agent-server`/`orchestration-server`) — used
that way throughout ARTEL-670/672's own text ("home 의 프로젝트 설정에서…") — so
this plan reads "redirect back to home" as "back to the artel-home
application," not literally to its `/` route, and implements the receiving
`useSearchParams` effect on the settings page specifically (`/projects/:id/settings`),
matching where `install-url` was invoked from. This plan does not build a
callback route in this repository either way, since the browser never lands
on one here — `install-url`'s returned URL is a github.com address, and the
subsequent redirect back comes from the server. **This reading is not
verified against the merged server behavior** (the server side is unmerged);
if the server instead redirects to the app's literal root, the query flag
would land on the project list where nothing reads it, and the connect flow's
"you're back, and here's the result" step would silently do nothing. This is
called out explicitly as a contract question in the PR, the same way the
`workspace`/`repository` field-name drift already is — not left as an
unstated assumption. Two races are accepted rather than engineered around, matching
the "no polling" non-goal: (1) if the user closes the GitHub tab or denies the
install without it completing, no redirect happens at all and the settings
page simply keeps showing whatever state it already had — nothing to correct;
(2) if the server's webhook/token exchange has not finished by the time the
redirect lands, `reloadExtras()` may still show state 1. The user sees the
repository picker on their next visit or manual refresh once the server
catches up; no loading spinner or retry loop is added for this narrow window.

### Step 6: i18n (`src/i18n/messages/tracker.ts`, `src/i18n/messages.ts`)

New `trackerEn`/`trackerKo` pair (registered under `t.tracker` in
`messages.ts`, matching every other domain file's registration). Covers:
`providerLabels.GITHUB` ("GitHub" in both locales — a proper noun, kept in
English per this repository's Korean-comment convention), the settings
panel's per-state copy (connect button, repository picker, severities,
disconnect, redirect notices), and the issue-row copy (export button, syncing
label, exported link format, failed label, retry). Extend
`t.projects.apiErrors` (both locales) with `CLIENT_MALFORMED_TRACKER_LINK`,
`CLIENT_MALFORMED_INSTALL_URL`, `CLIENT_MALFORMED_TRACKER_SYNC` — same bucket
`apiErrorMessage.ts` already reads for every domain's client-detected codes.

### Step 7: CSS (`src/App.css`)

Reuse `panel`, `panel-header--split`, `panel-header-actions`, `panel-empty`,
`panel-empty-block`, `panel-note`, `inline-error`, `badge`, `severity-tag`,
`button--secondary`/`--primary`/`--compact`, `detail-fields`,
`issue-row-meta`, `issue-row-actions`, `issue-row-error` as-is. Add, following
the existing token-only convention (`var(--color-*)`, `var(--space-*)`):

- `.tracker-repo-list` / `.tracker-repo-row` (flex column list, one row per
  repository, matching the visual rhythm of `.instance-row`).
- `.tracker-severity-list` (flex-wrap row of checkboxes) and
  `.tracker-severity-option` (inline-flex label + checkbox + text, matching
  the existing `.run-del-option` checkbox-label shape).
- `.tracker-link-meta` (small muted line for the "connected to X" state,
  matching `.instance-meta`).

### Step 8: Tests / validation

No test runner is configured for this repository (`project.md`: "Unit tests |
Not configured"). Validation is:

- `npm run typecheck`.
- `npx eslint` restricted to the changed files (repo-wide `npm run lint` is
  known-broken across `.worktrees/**` per the environment notes).
- Manual verification in the running app (documented in the PR, not claimed
  unless actually performed) covering:
  - No tracker link, owner view (connect button, `install-url` failure path).
  - No tracker link, member view (no button, quiet text).
  - Installed but no repository chosen, owner (repository list, connect,
    `repositories` failure path) and member (quiet text) views.
  - Connected, owner (severities toggle, disconnect,
    `updateTrackerLink`/`deleteTrackerLink` failure paths) and member
    (read-only) views.
  - `?tracker=connected` and `?tracker=failed` landing on the settings page,
    confirming the query param is stripped and a reload does not repeat the
    notice.
  - Issue list with `tracker: null` on every issue (server not shipping the
    field yet) rendering exactly as it does today when `trackerConnected` is
    false, and showing the export button per-row when `trackerConnected` is
    true.
  - Issue row export button → success (`SYNCED` link), and the two failure
    shapes (`FAILED` syncState with retry; a thrown request showing the
    generic inline error).

Given the server side of this contract is not merged, "connected" and
"synced" manual checks against a live server are not possible from this repo
alone; the PR states plainly which manual checks were actually run against
what (a mocked/stubbed response versus a live server) rather than implying
end-to-end verification that did not happen.

## Risks & Rollback

- **Risk:** the PUT field names (`workspace`/`repository` per the frozen
  contract vs. `repositoryOwner`/`repositoryName` per the ARTEL-670 story
  body) could still be wrong if the frozen contract itself drifts before the
  server merges. Mitigation: field names live in exactly one place
  (`TrackerLinkDraft` in `trackerTypes.ts`) so a rename is a one-file fix;
  flagged explicitly in the PR as a contract question, not silently guessed
  around.
- **Risk:** manual verification of the "connected" and "synced" states cannot
  be end-to-end (server not merged). Mitigation: verify against a stubbed
  `fetch`/local mock server or by temporarily pointing at a hand-rolled
  response, and say so plainly in the PR rather than implying a live check.
- **Rollback:** the change is additive (new module, new optional-at-parse
  fields, new panel). Reverting the PR removes the panel and the issue-row
  tracker UI with no migration or schema impact on this repository.

## Plan Review Notes

First-pass fast + medium review (subagents) both returned NONPASS. Every
finding was folded into the plan above; none were rejected:

- Fast (must-fix): `IssuesSection.tsx` was missing from Step 4 despite
  `IssueList`'s new required prop — added. Severity-checkbox failure path was
  unspecified — added (checkboxes are server-state-controlled, so failure
  needs no rollback, only an inline error). GitHub redirect flow ownership and
  race conditions were unspecified — added a paragraph clarifying the server
  owns the callback and naming the two accepted races. `installed` vs.
  `repository` as the state-3/state-2 discriminant was ambiguous — resolved to
  `repository`-only.
- Fast (should-fix): row layout collision — resolved by splitting the
  read-only meta display (`IssueTrackerStatus`) from the action button (stays
  inline in `IssueRow`), each placed in its existing div. Provider-degrade
  behavior — stated as intentional. 202-with-a-body handling — stated as
  intentional (this client reads `syncState`, not the status code).
- Medium (should-fix): `IssueRow`'s planned four-way inline branch was pulled
  into `IssueTrackerStatus` (paired with keeping the one-button action inline,
  since a single button+label swap does not carry its own component). The
  `Patch` type is now exported from `useIssueResolution.ts` and reused rather
  than redeclared. The one-entry provider-to-path lookup table's
  justification (consistency with every other tracker function's signature,
  not anticipated Jira work) is now stated explicitly in Step 1.

Heavy review (second pass) returned NONPASS with two blockers, both
plan-text corrections (no code implications):

1. The redirect-target paragraph said "redirects to home" without resolving
   whether that means this app's literal root route (`/`, which redirects to
   `/projects`) or the `artel-home` application generically. Resolved by
   reading it as the latter (matching how ARTEL-670/672 use "home" elsewhere)
   and stating the ambiguity as an explicit, unverified assumption to flag as
   a contract question in the PR — not silently resolved.
2. Non-goals overclaimed that "retry" was part of how a stuck `PENDING` row
   recovers, contradicting Step 4's actual rule (no retry button while
   `PENDING`). Corrected to state plainly that a genuinely stuck `PENDING` row
   has no user-triggered fix in this build.

## Pair Review Notes (post-implementation)

`pair-review-critic` returned `VERDICT: NONPASS` against the implemented diff,
with two blockers and one should-fix:

- **Accepted (must-fix, fixed):** `trackerLink`/`trackerConnected` were read
  straight off `useWorkspaceExtras` without gating on `extrasStatus`, unlike
  this codebase's own established convention (`DashboardSection.tsx`'s
  `settled = extrasStatus === 'ready'`). Since `trackerLink` starts `null`
  before the five-way `Promise.all` in `useWorkspaceExtras` settles — while
  `project` (a separate, usually-faster single `GET`) has typically already
  rendered `SettingsSection`/`IssuesSection` — an owner with an existing
  connection would see a real, reproducible flash of "Connect to GitHub" (or
  a row with no tracker UI) before the correct state appeared a moment later.
  Fixed: `TrackerLinkPanel` now renders a loading/failed state and returns
  early when `extrasStatus !== 'ready'` (after all its hooks have already run,
  matching `ProjectWorkspace.tsx`'s own early-return-after-hooks shape), and
  `IssuesSection`'s `trackerConnected` is now `extrasStatus === 'ready' &&
  trackerLink !== null && trackerLink.repository !== null`.
- **Rejected (was framed as must-fix):** that the issue row's export/retry
  button must be owner-gated. This traces to an error in the review brief
  this agent wrote for the critic, not a real gap: the brief stated "write
  actions are owner-only" as a blanket rule, when the actual task text scopes
  that rule to the settings connect/disconnect/severity actions specifically
  ("연결과 해제는 프로젝트 소유자만 할 수 있다" — connect and disconnect are
  owner-only — appears right after, and only after, the three-state settings
  panel description). ARTEL-670's own acceptance criteria describes manual
  export as something "사람이 눌러" (a person clicks), with no owner
  qualifier, mirroring how `IssueRow`'s existing resolve/reopen action has
  never been owner-gated. Re-verified against both source documents before
  rejecting; not changed.
- **Accepted (should-fix, fixed):** `connectingRepo` was keyed by the bare
  `repository.repository` field, which two same-named repositories under
  different GitHub organizations in one installation would collide on
  (cosmetic only — the actual `PUT` body was always correct). Fixed with a
  `repoKey()` helper keying on `workspace/repository`, reused for both the
  list's React `key` and the "which row is connecting" comparison.

## Open Questions

- Confirmed against the task brief's frozen contract, not against a live
  server (server work is concurrent and unmerged). If the merged server
  contract differs from what is coded here, follow-up is expected rather than
  blocking this PR.
