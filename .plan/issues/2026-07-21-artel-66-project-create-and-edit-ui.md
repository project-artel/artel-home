# 2026-07-21 — ARTEL-66 Project Creation and Editing UI

- Date: 2026-07-21
- Jira Issue: ARTEL-66
- Status: In Review
- Repository: `artel-home`
- Work Type: `feat`
- Server counterpart: `artel-orchestration-server` ARTEL-58 (Project CRUD + planning-document storage)

## Goal

Give a signed-in user a place to create a project, see the projects they own,
open one, edit its information, and upload a planning document (기획서) to it.
A project is the container every later Replay Studio surface hangs off, so the
list is the first screen behind the login boundary and its data shape must
survive the addition of sessions, runs, and bug reports without a rewrite.

## Non-goals

- Archiving, sharing, or member management. Deletion **is** in scope (the server
  spec defines it), but only as a confirmed destructive action on the detail
  page — there is no bulk delete and no undo affordance, because the server's
  soft delete is not exposed as restorable.
- In-browser rendering or preview of the planning document. The document is
  uploaded, listed, and downloaded; parsing it belongs to the agent pipeline.
- Any Replay Studio workspace work (viewport, timeline, inspector). The current
  empty state moves behind a project, it is not redesigned.
- A client-side cache or data-fetching library. See Deferred Work.
- Offline support or optimistic updates.

## Context / Constraints

- Login is already merged (`develop`, PR #6). `AuthProvider` renders `LoginPage`
  for `unauthenticated` / `error`, so every screen in this plan is only ever
  mounted for an authenticated user. No route-level auth guard is needed beyond
  what the shell already does.
- `apiFetch` in [src/auth/authApi.ts](src/auth/authApi.ts) is the single
  credentialed request path and the single place `401` is handled. Every call
  added here must go through it and must not add its own `401` branch.
- Access tokens expire after 15 minutes, so a `401` mid-form is routine. It
  unmounts the whole tree back to `LoginPage` — unsaved form input is lost and
  that is accepted behaviour for this issue.
- The repository has **no router and no test harness today**. Both facts are
  recorded in [README.md](README.md) and
  [.agents/docs/project.md](.agents/docs/project.md); the README also confirms
  static hosting rewrites unknown paths to `index.html`, which is what makes a
  real router safe to introduce.
- [.agents/docs/DESIGN.md](.agents/docs/DESIGN.md) is binding: dark-first
  graphite surfaces, semantic tokens only (no hex in TSX), dense but not
  crowded, no KPI-dashboard or repeated-rounded-card layouts, colour never the
  sole carrier of status.
- Server IDs are opaque strings in JSON (`/api/auth/me` already returns
  `id: string`). Project and document IDs are treated the same way: never
  parsed, never arithmetic.

## Architecture

1. `main.tsx` mounts `AuthProvider` → `App`. `App` keeps the loading /
   unauthenticated branches exactly as they are and, when authenticated,
   renders the top bar plus a `<BrowserRouter>` for the workspace area.
2. Routes:
   - `/` → redirect to `/projects`
   - `/projects` → `ProjectListPage` (list + "New project" dialog)
   - `/projects/:projectId` → `ProjectDetailPage` (info form + document panel)
   - `/login` → renders `LoginPage`; reached by the server's
     `?error=oauth|server` failure redirect
   - `*` → `NotFoundPage` with a link back to `/projects`
3. `src/projects/projectApi.ts` owns every project HTTP call and every response
   parser. It imports `apiFetch` from `../auth/authApi` and exports typed
   functions only — no component imports `fetch` directly.
4. `src/projects/useProjects.ts` / `useProject.ts` are thin hooks over
   `useState` + `useEffect` + `AbortController`, modelled on `AuthProvider`.
   They expose `{ status, data, error, reload }` and no global store.
5. Document upload is a three-step presigned flow. Home never sees an AWS
   credential and the file bytes never pass through the orchestration server:
   1. `POST /api/projects/{id}/documents/upload-url` with file name, content
      type, and size → `{ uploadUrl, objectKey, requiredHeaders, expiresAt }`.
   2. `PUT uploadUrl` **without** `credentials: 'include'` — this request goes
      to S3, not to our origin, and attaching the session cookie would both
      leak it cross-origin and break the signature. This is the one upload call
      that deliberately bypasses `apiFetch`.
   3. `POST /api/projects/{id}/documents` with the returned `objectKey` to
      register the version. Only after this call does the document exist.
6. Uploads use `XMLHttpRequest` for step 2, because `fetch` cannot report
   upload progress and a 기획서 is large enough that a silent multi-second wait
   reads as a broken button.

## API Contract (agreed with ARTEL-58)

Reconciled 2026-07-21 with the Notion API spec DB; ARTEL-58 records the
divergences from that draft and writes the implemented contract back.

```text
GET    /api/projects?page=0&size=20                   200 ProjectPage
POST   /api/projects                                  201 ProjectDetail
GET    /api/projects/{projectId}                      200 ProjectDetail
PATCH  /api/projects/{projectId}                      200 ProjectDetail
DELETE /api/projects/{projectId}                      200 { deleted, projectId }
POST   /api/projects/{projectId}/documents/upload-url 200 UploadTicket
POST   /api/projects/{projectId}/documents            201 ProjectDocument
GET    /api/projects/{projectId}/documents            200 ProjectDocument[]  (newest version first)
GET    /api/projects/{projectId}/documents/{id}/download-url  200 DownloadTicket
```

```ts
type Genre = 'ACTION' | 'RPG' | 'PUZZLE' | 'SIMULATION' | 'STRATEGY'
           | 'SPORTS' | 'SHOOTER' | 'CASUAL' | 'OTHER'

/** `myRole` decides whether owner-only actions render at all. */
type ProjectRole = 'OWNER' | 'MEMBER'

type ProjectSummary = {
  id: string
  name: string
  genre: Genre
  description: string | null
  documentCount: number
  latestDocument: ProjectDocument | null
  myRole: ProjectRole
  updatedAt: string
}

type ProjectPage = {
  items: ProjectSummary[]
  page: number
  size: number
  total: number
}

/**
 * `document` is the latest version only; full history is a separate call.
 * There is deliberately no `documentCount` here — the detail screen loads the
 * history anyway, and a second count could disagree with the list beside it.
 */
type ProjectDetail = {
  id: string
  name: string
  genre: Genre
  description: string | null
  myRole: ProjectRole
  document: ProjectDocument | null
  createdAt: string
  updatedAt: string
}

type ProjectDocument = {
  id: string
  version: number          // 1-based, monotonic per project
  fileName: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
  uploadedBy: { id: string; displayName: string }
  parseStatus: 'PENDING'   // reserved; nothing advances it yet
}
```

- `POST /api/projects` body: `{ name, description, genre }`.
- `PATCH /api/projects/{id}` body: any subset of `{ name, description, genre }`.
- `parseStatus` is a placeholder for the future parsing pipeline and is always
  `PENDING`. Render it as a static label ("파싱 대기") if at all — **never** as a
  spinner or progress indicator, because nothing will ever move it.
- `DELETE` is a soft delete: the project disappears from the list and every
  subsequent read returns `404`, indistinguishable from a project that never
  existed. Only an `OWNER` may delete; a member who tries gets `403`, while a
  non-member gets `404` and is never told the project exists.
- Uploading a new document **adds a version**; it never replaces one. The
  highest `version` is the current 기획서 and is what the detail page leads with.
- Validation errors return `400` with `{ code, message, fields?: Record<string, string> }`.
  Home renders `fields` inline per input and falls back to `message` when absent.

### Decided 2026-07-21

- **`genre` is a closed enum** — the nine values in the `Genre` type above. The
  `<select>` is generated from that union, so a value the server does not accept
  cannot be submitted. `OTHER` is the escape hatch and the create-form default.
- **PDF only**, `application/pdf` with a `.pdf` extension.
- **50 MB ceiling**, zero-byte files rejected.
- These three are enforced by ARTEL-58 as well; the client validates first only
  to give immediate feedback, and must never advertise a looser rule than the
  server enforces. If the two ever disagree, the server wins and the client is
  the bug.

- Parsers follow the lesson recorded in
  [.plan/issues/2026-07-19-artel-45-login-jwt-session.md](.plan/issues/2026-07-19-artel-45-login-jwt-session.md):
  require only the fields the UI actually renders, degrade everything else to a
  safe default, and never reject a whole response over a cosmetic field.

## Screens

### `ProjectListPage`

- A dense list — one row per project, not a card grid. Row shows name, genre
  label, truncated description, document state, and relative `updatedAt`.
- Document state is text plus shape, never colour alone: `v3 · design.pdf` or
  a muted `No planning document`.
- Header holds one primary action, `New project`.
- States: loading (skeleton rows, `aria-busy`), empty (explains what a project
  is and repeats the create action), error (message plus `Retry` calling
  `reload`).

### `ProjectCreateDialog`

- Fields: `Name` (required, 1–80 chars), `Description` (optional, ≤ 2000,
  textarea), `Genre` (required, `<select>` over the enum, default `OTHER`).
- Client validation mirrors the server's limits but the server stays the
  authority; a `400` maps back onto the same inline field errors.
- Focus moves into the dialog on open, `Escape` closes, focus returns to the
  trigger, and the submit button shows a pending state. On success, navigate to
  `/projects/{id}`.

### `ProjectDetailPage`

- Header: project name, genre, `updatedAt`, and a back link to `/projects`.
- **Information** section: the same three fields, pre-filled, saved with
  `PATCH`. Save is disabled while unchanged; success is announced through
  `aria-live="polite"`.
- **Planning document** section: current version first
  (`v3 · design.pdf · 2.4 MB · 2026-07-21 · uploaded by …`) with a `Download`
  action that resolves a fresh download URL on click — never a long-lived URL
  baked into the DOM. Older versions are listed below it.
- **Upload** control: file input plus drag-and-drop on the panel, `accept=".pdf,application/pdf"`.
  Client-side guards reject a non-PDF and anything over 50 MB or of zero length
  before a request is made, echoing — never widening — the server's rules. The
  empty state says "PDF, up to 50 MB" so the constraint is visible before the
  user picks a file rather than only after a rejection. Progress is a determinate bar with
  the percentage also as text; failures are `role="alert"` and keep the chosen
  file so `Retry` does not require re-picking it.
- A `404` on the project (deleted or not owned) renders a "project not found"
  state, not a crash.

## Approach (Checklist)

- [x] **Step 0: Recon** — confirm the merged `develop` state and re-read
      `DESIGN.md`, `web-interface-guidelines`, and the ARTEL-45 plan for the
      established client conventions.
- [x] Add `react-router-dom` and mount `BrowserRouter` inside the authenticated
      branch of `App.tsx`; move the existing empty state under `/projects`.
- [x] Move the top bar out of `App.tsx` into `src/shell/AppShell.tsx` so both
      routes share it without duplication.
- [x] Add `src/projects/projectTypes.ts` with the types above.
- [x] Add `src/projects/projectApi.ts` (list, create, get, patch, upload
      ticket, register document, list documents, download ticket) with a
      tolerant parser per response type.
- [x] Add `src/projects/uploadDocument.ts` — the XHR-based presigned PUT with
      progress, abort, and error mapping.
- [x] Add `useProjects` and `useProject` hooks with `AbortController` cleanup.
- [x] Build `ProjectListPage` with loading, empty, error, and populated states.
- [x] Build `ProjectCreateDialog` with focus trap, `Escape`, and inline errors.
- [x] Build `ProjectDetailPage` information form with dirty tracking and
      `PATCH` save. **Changed during implementation:** the panel reads as a
      definition list and the form opens behind an `Edit` button. A form left
      permanently open makes the whole page read as a settings screen, and the
      project tab is going to gain more panels.
- [x] Add "Load more" paging to the list, driven by `total` vs items loaded.
- [x] Add the delete action: a confirmation dialog that requires an explicit
      second step, then `DELETE` and navigate back to `/projects`. Deletion is
      not reversible from the UI, so it must never be one stray click.
- [x] Build the document panel: current version, history, upload with progress,
      download-on-click.
- [x] Add `NotFoundPage` and the `/login` route so the server failure redirect
      lands on a real screen.
- [x] Extract shared primitives only where they are used twice or more
      (`Button`, `Field`, `Dialog`) under `src/design-system/primitives/`, per
      DESIGN.md — do not build the full primitive set speculatively.
- [x] Update `README.md` (project structure, routes, upload flow, the fact that
      SPA fallback is now load-bearing rather than nice-to-have).
- [x] Run lint, type-check, and the production build.
- [ ] Automated tests. Still none — this repository has no test harness, so
      every guarantee below is manual. Not silently dropped.
- [x] Manually verify the full flow against a locally running orchestration
      server on the ARTEL-58 branch.

## Configuration

- `VITE_ORCHESTRATION_URL` — unchanged; still the orchestration-server origin.
- No new environment variable. Bucket, region, and URL lifetime stay server-side
  by design; the client only ever receives an opaque `uploadUrl`.

## Validation

- **Commands:** `npm run lint`, `npm run typecheck`, `npm run build`
- **Manual:** create a project → appears in the list → open it → edit each
  field and save → reload and confirm persistence → upload a document →
  progress advances → the new version becomes current → the previous version is
  still listed → download resolves and opens → upload a rejected file type →
  upload an oversized file → force a `401` (clear the cookie mid-session) and
  confirm the app returns to `LoginPage` → deep-link straight to
  `/projects/{id}` in a fresh tab → hit an unknown path and confirm the SPA
  fallback plus `NotFoundPage`.
- **Layout:** verify at 1024px and 1440px per DESIGN.md.
- **Accessibility:** full keyboard pass on the dialog and the upload control,
  visible focus rings, `role="alert"` on failures, `aria-live="polite"` on save
  and upload completion, 44px touch targets on primary actions.

## Risks / Mitigations

- **SPA fallback becomes load-bearing.** Today a missing rewrite only breaks the
  `?error=` redirect; after this change every project deep link 404s without it.
  Mitigation: document it in `README.md` and verify a deep link against the
  built output before the PR is marked ready.
- **Presigned PUT is blocked by S3 CORS.** The bucket must allow `PUT` from the
  Home origin with `Content-Type` in `AllowedHeaders`. This cannot be validated
  from the client side alone. Mitigation: agreed as an explicit deliverable of
  ARTEL-58 and verified jointly before either PR merges.
- **Session expiry during an upload.** The upload ticket outlives the access
  token, so step 3 can `401` after the bytes are already in S3, leaving an
  orphaned object. Mitigation: the server treats unregistered objects as garbage
  and reaps them; Home reports the failure honestly rather than claiming success.
- **No test harness.** Every guarantee here is manual. Mitigation: the checklist
  states this plainly and the follow-up to introduce Vitest + Testing Library
  stays on the backlog; do not claim coverage that does not exist.
- **Router introduction touches the shell.** Mitigation: the auth branches in
  `App.tsx` are left byte-for-byte intact and only the authenticated subtree is
  moved, so a regression cannot reach the login boundary.

## Deferred Work

Project deletion and archiving, member/sharing management, document preview,
a data-fetching library (TanStack Query) once more than two screens share
server state, a test harness (Vitest + Testing Library), Storybook coverage of
the new primitives, and resumable/multipart upload for very large documents.

## Open Questions

- **How should page 2+ be reached?** Pagination is settled (the server returns
  `{items, page, size, total}`), but the interaction is not. This plan assumes a
  plain "Load more" button appending to the list, because it is the least code
  and degrades well when `total` is small. Numbered pages or infinite scroll
  would both need the page number in the URL to stay linkable.
- **Where does the existing Replay Studio empty state belong?** It is parked
  under `/projects` for now. Once sessions attach to a project it likely moves
  to `/projects/:projectId/replay`, which is a separate issue.
