# 2026-07-22 — 게임 인스턴스 및 게임 빌드 관리 UI 구현

- Date: 2026-07-22
- Jira Issue: ARTEL-76
- Status: Draft
- Repository: home
- Work Type: feat
- Server counterpart: ARTEL-75 (orchestration-server)
- SDK counterpart: ARTEL-77 (sdk)

## Goal

Add two panels to the project detail screen and the flow that connects them to a Unity game:

1. **Game instances** — a list of SDK installations belonging to the project, each renameable and
   deletable, each showing its permanent instance key and whether it is currently connected.
2. **Add game instance** — a dialog that picks a platform (only Unity is available), then shows the
   SDK install guide and the freshly issued instance key the developer types into Unity.
3. **Game builds** — a list of versions the SDK has reported, with `label` and `notes` editable
   in place. `version` is observed from Player Settings and is never editable.

## Non-goals

- **Platform values other than Unity.** They appear in the picker as unavailable, but nothing is
  built behind them.
- **A route for a single build or instance.** See Architecture — inline expansion, not a nested
  route.
- **A client-side cache or data-fetching library**, and **speculative optimistic updates**. Both are
  on ARTEL-66's deferred list; state stays in `useState` + `useEffect` + `AbortController`. The
  existing `applyProject` / `applyNewDocument` helpers apply a response the caller already holds,
  which is what this issue extends.
- **Key rotation or a "regenerate key" action.** The server has no such endpoint (ARTEL-75).
- **Deleting builds.** No server endpoint; a deleted build would reappear on the next registration.
- **Automated tests.** This repository still has no test harness — see Validation. Not silently
  dropped, and not faked.

## Context

- `.agents/docs/DESIGN.md` is binding. The rules that shape this work:
  - *Dense, not crowded* — instances and builds are **dense list rows**, matching `.project-list`
    and `.document-list`, not card grids.
  - *Never place raw hexadecimal colors in TSX files.* All styling goes through classes in
    `src/App.css` referencing the tokens in `src/styles/tokens.css`
    (`--color-bg-surface`, `--color-border-subtle`, `--color-text-muted`,
    `--color-action-primary`, `--color-status-critical`, `--color-status-success`, …).
  - *Monospace only for timestamps, IDs, logs, and input events*, with
    `font-variant-numeric: tabular-nums`. The existing `.mono` class does exactly this — it is the
    right class for **instance keys and version strings**.
  - *Never communicate state by colour alone.* A connected instance gets a text label, not just a
    green dot.
  - Definition of done requires loading, empty, error, and disconnected states, keyboard focus and
    screen-reader labels, and a layout verified at **1024px and 1440px**.
  - Pointer targets ≥32×32px, ≥44×44px on touch. `.button` already encodes this.
- Every authenticated call goes through `apiFetch` (`src/auth/authApi.ts`), which sets
  `credentials: 'include'` and owns the single 401 branch. No call adds its own.
- `projectApi.ts` conventions to follow exactly: `ProjectApiError` with `status`/`code`/`fields` and
  `isNotFound`/`isForbidden`; tolerant `parseX` helpers that require only the identifying fields and
  degrade the rest; `projectPath()` for escaping opaque ids; `jsonRequest(body)` spread into the
  init; `signal?: AbortSignal` last.
- `useProject` models the whole detail screen with **one** status (`loading | ready | missing |
  error`) by combining loads with `Promise.all`, treats 404 as its own `missing` state, and exposes
  `apply*` helpers so a mutation does not trigger a refetch.
- Permission-gated actions are **rendered or omitted, never disabled** — `ProjectDetailPage`
  documents why a permanently-dead control is worse than an absent one.
- Comments in this codebase explain *why*, at length, and are load-bearing to review.

## Constraints

- The API contract below is agreed with ARTEL-75 and is implemented in the same cycle. If the server
  lands a different shape, this plan is wrong, not the server.
- `.detail-columns` is `minmax(0,1fr) minmax(0,1fr)`, collapsing to one column below 1024px.
- `.dialog-panel` is `width: min(100%, 520px)`; the install guide must fit or earn a modifier class.
- No test runner is installed (`package.json` has no vitest/jest/@testing-library, and `src/`
  contains zero test files).

## Architecture

### Where the panels go

`ProjectDetailView` currently renders two panels inside one `.detail-columns` grid. Two more panels
join the same grid and wrap into a second row, giving a 2×2 layout at ≥1024px and a single column
below it. **No CSS change to `.detail-columns`.**

Chosen over giving the lists a full-width row because the rows are short (a name, a key, a status
line) and a full-width row would leave most of the width empty at 1440px. Verified at both widths
before the PR, per the DESIGN.md definition of done.

### Build detail: inline, not routed

An expanded row inside the builds panel, using the same read-mode `<dl>` → `Edit` → in-place form
shape as the Information panel. Reasons, all grounded in the repo:

- There is no nested-layout precedent: `AppShell` is the only layout route and its `Outlet` is the
  whole workspace, so a nested route would have no visual home to render into.
- A route adds a fresh loading/missing/error triad and more SPA-fallback surface, for data
  `useProject` already holds.
- "Label and notes editable, version read-only" is precisely the Information panel's shape.

If a linkable build is wanted later, a `?build=<id>` search param on the existing route is the
cheaper convention-compatible move than a nested path.

### Instance rename and delete

Rename is an inline row form (name input + Save/Cancel), matching the Information panel's
draft/`dirty`/`cancelEditing` handling. Delete opens a confirmation dialog modeled on
`DeleteProjectDialog` — the instance name spelled out in the question, the destructive button
second so it is not focus-first, `isForbidden` mapped to its own message. An inline delete without
confirmation would be the one destructive control on the screen that has no guard.

### Platform picker

`projectTypes.ts` establishes the pattern: an `as const` array, a derived union, a
`Record<T, string>` label map, a type guard, and a `DEFAULT_`. The genre enum's rationale — *"the
`<select>` is generated from this list, so a value the server does not accept can never be
submitted"* — applies directly.

So: `GAME_PLATFORMS = ['UNITY'] as const` is the submittable set, and a separate
`UNAVAILABLE_PLATFORM_LABELS` drives disabled options rendered with an explicit
`(준비 중)` suffix in the option text. A bare `disabled` attribute would be exactly the dead UI the
codebase already rejects; the label is what makes it informative rather than broken.

### The instance key

Displayed on every instance row in `.mono`, with a copy-to-clipboard button and an `aria-live`
confirmation. **Copying is the intended path, not retyping** — the same applies to the package git
URL in the install guide, which gets its own copy button. Every value the developer has to move into
Unity by hand is a copy target; nothing in this flow expects transcription. **Re-readable, not
show-once** — it is a durable credential the developer needs again
after reinstalling the SDK, and there is no re-issue endpoint. This is a deliberate departure from
the presigned-URL precedent in `projectApi.ts` (which resolves on click so a short-lived URL never
sits in the DOM); the reasoning does not transfer, because this value has no expiry to outlive.

### Install guide

Rendered in the creation dialog after a successful create, replacing the form in the same dialog
rather than opening a second one. Four steps:

1. Unity Package Manager → Add package from git URL —
   `https://github.com/project-artel/artel-sdk.git` in `.mono` with a copy button
2. Create an empty GameObject in the scene
3. Add the `ArtelManager` component to it
4. Run the game and paste this key into the Artel window — key in `.mono` with a copy button

The same guide is reachable afterwards from a `설치 안내` action on the instance row, so closing the
dialog does not strand anyone.

## API Contract

Agreed with ARTEL-75. All ids are strings; `null` in a PATCH body means untouched and `""` clears.

```
GET    /api/projects/{projectId}/game-instances       -> { "items": [GameInstance] }
POST   /api/projects/{projectId}/game-instances       -> GameInstance   { name, platform }
PATCH  /api/projects/{projectId}/game-instances/{id}  -> GameInstance   { name }
DELETE /api/projects/{projectId}/game-instances/{id}  -> 204

GET    /api/projects/{projectId}/game-builds          -> { "items": [GameBuild] }
PATCH  /api/projects/{projectId}/game-builds/{id}     -> GameBuild      { label, notes }
```

```jsonc
// GameInstance
{ "id": "12", "projectId": "3", "name": "내 맥북", "platform": "UNITY",
  "instanceKey": "H4KQ2-8VTRM-9XZ0C-N5JWE",
  "connected": false, "lastConnectedAt": "2026-07-22T09:12:03Z",
  "createdAt": "…", "updatedAt": "…" }

// GameBuild
{ "id": "5", "projectId": "3", "version": "1.2.3",
  "label": "1차 QA 빌드", "notes": null, "createdAt": "…", "updatedAt": "…" }
```

Parsers require `id` plus the display field (`name` / `version`) and degrade everything else, per
the documented policy that dropping a whole list over one cosmetic field leaves the user with no way
forward. Missing timestamps render as `—` through `formatters.ts`.

## Screens

**Game instances panel**

- Header: `Game instances` + `인스턴스 추가` primary button.
- Row: name (15px/600) · platform badge · connection state as **text** (`연결됨` / `연결 안 됨`)
  · key in `.mono` with a copy button · `lastConnectedAt` in the muted meta line · compact
  `Edit` / `설치 안내` / `Delete` actions.
- Empty: `.panel-empty` explaining what an instance is and repeating the add action.
- Loading: skeleton rows with `aria-busy` and `aria-label`, matching `ProjectListPage`.
- Error: `.inline-error` with `role="alert"` and a compact Retry, matching `DocumentPanel`.

**Add instance dialog** — platform `<select>` (Unity selectable, others `(준비 중)` and disabled),
name field, then the guide view after create.

**Game builds panel** — row: version in `.mono` · label or `—` · created date; expanding a row
reveals the read-mode `<dl>` and an `Edit` button that swaps in the label/notes form.

Every mutation ends with a short `aria-live="polite"` summary in a `.visually-hidden` paragraph:
`'Instance saved.'`, `'Key copied.'`, `'Build updated.'`.

## Approach (Checklist)

- [ ] **Step 0: Recon.** Re-read `DESIGN.md`, `ProjectDetailPage.tsx`, `DocumentPanel.tsx`,
      `DeleteProjectDialog.tsx`, `Dialog.tsx`, `projectApi.ts`.
- [ ] **Step 1: Types.** `src/projects/gameTypes.ts` — `GameInstance`, `GameBuild`,
      `GAME_PLATFORMS`, `PLATFORM_LABELS`, `UNAVAILABLE_PLATFORM_LABELS`, `isGamePlatform`,
      `INSTANCE_NAME_MAX_LENGTH`, `BUILD_LABEL_MAX_LENGTH`, `BUILD_NOTES_MAX_LENGTH`.
- [ ] **Step 2: API.** `src/projects/gameApi.ts` — six functions over `apiFetch`, tolerant parsers,
      `projectPath`-style escaping, `ProjectApiError` reused rather than re-declared.
- [ ] **Step 3: Hook.** Extend `useProject` with `instances` and `builds` as further `Promise.all`
      legs so the screen keeps one status, plus `applyInstance`, `applyNewInstance`,
      `removeInstance`, `applyBuild`.
- [ ] **Step 4: Instances panel.** `GameInstancePanel.tsx` + `DeleteGameInstanceDialog.tsx`.
- [ ] **Step 5: Create dialog + guide.** `GameInstanceCreateDialog.tsx`, `SdkInstallGuide.tsx`
      (shared between the post-create view and the row action).
- [ ] **Step 6: Builds panel.** `GameBuildPanel.tsx`.
- [ ] **Step 7: Wire into `ProjectDetailView`** inside the existing `.detail-columns` grid.
- [ ] **Step 8: Styles.** New classes in `src/App.css` for the instance row, the key line, the copy
      button, and the guide list — tokens only, no hex.
- [ ] **Step 9: Manual verification.** See Validation.

## Validation

**Commands**

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run build
```

- [ ] **Automated tests. Still none** — this repository has no test harness, so every guarantee
      below is manual. Recorded, not silently dropped. A Vitest + Testing Library harness stays on
      the deferred list.

**Manual checks**

- Create an instance; the key appears, copies, and matches what the server returned.
- Enter the key in a Unity build (ARTEL-77); the instance flips to `연결됨` after reload and a build
  row appears with the reported version.
- Rename and delete an instance; delete asks first.
- Edit a build's label and notes; confirm no control offers to edit `version`.
- Empty, loading, and error states for both panels (error forced by stopping the server).
- Keyboard-only pass: tab order, dialog focus trap and return, Escape.
- Layout at **1024px and 1440px**; confirm the 2×2 grid does not overflow and rows do not shift when
  `connected` flips.
- Screen-reader pass on the `aria-live` announcements.

## Risks & Mitigations

- **The contract is unimplemented while this is built.** Mitigation: ARTEL-75 lands first, or the
  panels are developed against a locally running server. No mocking layer is introduced — it would
  be the one place the contract could silently drift.
- **`connected` is a snapshot, not a subscription.** It is whatever the last fetch said. No polling
  in this issue; the state text is phrased so a stale value reads as "as of the last load" rather
  than a live indicator. Live status belongs with the replay/session work.
- **A 401 mid-form unmounts the tree back to `LoginPage` and loses input.** Documented and accepted
  in ARTEL-66; not designed around.
- **Four panels in a 2×2 grid may crowd at exactly 1024px.** Caught by the required width check; the
  fallback is a full-width row for the builds panel, which is a CSS-only change.
- **Rollback:** additive. `git revert` removes the panels; nothing else on the screen depends on
  them.

## Deferred Work

- Vitest + Testing Library harness.
- Live connection status (polling or socket).
- A linkable `?build=<id>` deep link.
- Platform values beyond Unity.
- Key rotation UI, once the server supports it.

## Settled

- **No role gating.** Instance create/rename/delete render for every project member, matching the
  document upload panel rather than the owner-gated project delete. Decided with the product owner;
  revisit only if the server starts enforcing OWNER.
- **The builds panel does not show which instance reported a version.** Builds are project-owned and
  the server returns no instance reference.
