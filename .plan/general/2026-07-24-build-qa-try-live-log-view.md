# 2026-07-24 — Build QA Try Live Log View

- Date: 2026-07-24
- GitHub Issue: None
- Status: Implemented

## Goal

Implement Jira ARTEL-120 as an authenticated QA Try detail experience that:

- loads one QA Try and its latest 50 persisted logs;
- shows `GameStreamView` and appends SSE events only while the try is `STARTING` or `RUNNING`;
- shows persisted logs without opening live transports after a terminal state;
- loads older logs with an upward infinite scroll while preserving the reader's visual position;
- presents `LOG`, `ACTION`, `ACTION_RESULT`, `GAME_STATE`, `STATUS`, and `ERROR` as compact, inspectable evidence.

## Non-goals

- Agent Server behavior, prompts, or WebSocket implementation.
- Orchestration persistence, SDK bridging, JSON-RPC execution, or pass/fail evaluation.
- A QA Try list, recorded video replay, log search/filtering, cancellation, or bug creation.
- A new streaming implementation; the page reuses `GameStreamView` unchanged.
- Client-side reconstruction of a passed/failed result. Terminal status is displayed as stored evidence only.

## Context / Constraints

- ARTEL-120 is the frontend work item; the matching orchestration work is tracked separately by ARTEL-121.
- The branch is `feat/QA-Try-실시간-스트리밍-및-로그-무한-스크롤-UI-구현-ARTEL-120`, based on `origin/develop`.
- The current frontend has no QA domain module or test runner. It already centralizes authenticated HTTP through `apiFetch`, SSE URL creation through `orchestrationUrlFor`, route-level missing/error handling, and Unity viewing through `GameStreamView`.
- Follow `.agents/docs/DESIGN.md`: dark Replay Studio surfaces, semantic tokens, chronological evidence, cyan action, violet reasoning/log, green success, amber warning/retry, coral failure, monospace timestamps/IDs, and no color-only meaning.
- Keep raw API parsing separate from UI view models. Unknown message types and malformed optional payload fields must degrade safely rather than break the whole timeline.
- The orchestration QA API does not exist on the current `origin/develop`; implementation must lock to ARTEL-121's final DTOs before coding. The frontend contract assumed by this plan is:

  ```text
  GET /api/qa-tries/{qaTryId}
  → {
      id, testScenarioId, gameInstanceId, agentSessionId?,
      status: "STARTING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED",
      startedAt?, completedAt?
    }

  GET /api/qa-tries/{qaTryId}/logs?size=50[&beforeId={oldestLoadedId}]
  → {
      items: [{
        id, qaTryId, messageId?, correlationId?,
        direction: "AGENT_TO_ORCHE" | "ORCHE_TO_AGENT" |
                   "ORCHE_TO_SDK" | "SDK_TO_ORCHE" | "ORCHE_INTERNAL",
        type: "LOG" | "ACTION" | "ACTION_RESULT" |
              "GAME_STATE" | "STATUS" | "ERROR",
        message, payload, createdAt
      }],
      hasMore, nextBeforeId?
    }

  GET /api/qa-tries/{qaTryId}/events?afterId={newestLoadedId}
  → text/event-stream where every event is named `log`, its data is one complete
    QaLogResponse, and its SSE id is qa_log.id.
  ```

- Log pages arrive oldest-to-newest within each response, with the initial response containing the latest 50 and `{ items, nextBeforeId, hasMore }`.
- `qa_log.id` is the sole log identity and a stable, strictly increasing cursor within a try. SSE and REST may overlap; merge only by log `id`.
- Every public identifier and cursor is a decimal string: `qaTryId`, `testScenarioId`, `gameInstanceId`, optional `agentSessionId`, `qa_log.id`, optional `messageId`/`correlationId`, `beforeId`/`nextBeforeId`/`afterId`, and the SSE event id. Validate `/^\d+$/`, preserve the original string on the wire, and use `BigInt` only in a safe comparator when IDs must be ordered; never convert them to `Number`.
- A `STATUS` log carries `payload: { status, completedAt }`. It updates the in-memory QA Try and closes SSE/unmounts the stream when the status becomes terminal.
- `COMPLETED` means execution ended; it does not mean passed. The frontend must not label it as a successful test result.
- `EventSource` uses `{ withCredentials: true }` and opens initially with `afterId` equal to the newest REST-loaded log ID. Native reconnect sends `Last-Event-ID`, which the server uses for replay; the client must not substitute its own reconnect cursor.
- Route shape: `/projects/:projectId/qa-tries/:qaTryId`. `projectId` supplies the back link; the server remains authoritative for try access and `gameInstanceId`.
- ARTEL-120 exposes this route as a deep link/manual URL only. Adding a list, creation flow, or navigation entry is outside the issue unless existing scope is explicitly expanded.
- MVP intentionally retains every loaded log in the DOM so browser Find, chronological keyboard navigation, and prepend anchoring stay simple. `content-visibility` may reduce paint work but is not virtualization; manually profile at 1,000 loaded rows and record the residual unbounded-memory risk rather than claiming it is removed.

## Approach (Checklist)

- [x] **Step 0: Recon**
  - Confirm repository guidance, design tokens, current route architecture, authenticated API helpers, SSE precedent, and `GameStreamView` boundaries.
  - Before implementation, verify ARTEL-121's controller and DTOs match the locked contract above; stop on a mismatch rather than adding compatibility guesses.

- [x] **Step 1: Define QA API and domain types**
  - Add `src/qa/qaTypes.ts` for wire-safe status, direction, event-type, try, log, cursor-page, and timeline view-model types.
  - Add `src/qa/qaApi.ts` using `apiFetch`, `readJson`, `toApiError`, and `orchestrationUrlFor`.
  - Parse required identifiers/statuses strictly enough to surface an unreadable detail response, but tolerate nullable metadata and arbitrary JSON `payload`.
  - Request `size=50`; encode `beforeId` only for older-page requests. Normalize ordering and expose `hasMore`/`nextBeforeId`.
  - Parse every SSE `log` payload as the same `QaLogResponse` used by REST. Ignore unknown future log `type` values without dropping the stream.

- [x] **Step 2: Implement the QA Try session hook**
  - Add `src/qa/useQaTry.ts` to fetch detail and the initial latest-50 page together with one abort lifecycle.
  - Key the page by `qaTryId`, abort fetches on route change, close the old `EventSource` in its own effect cleanup, and gate every async callback with the current route generation so late results cannot populate a newly opened try.
  - Model `loading`, `ready`, `missing`, and `error` page states independently from `live`, `reconnecting`, and `closed` SSE states.
  - Open SSE only when status is `STARTING` or `RUNNING`; include `afterId` from the newest initially loaded log, never mount it for terminal tries, and close it as soon as a `STATUS` log or refetch makes the try terminal.
  - Append live logs in chronological order and deduplicate overlapping REST/SSE delivery by stable log ID.
  - Let native `EventSource` reconnect with `Last-Event-ID`, relying on server-side replay. Preserve already readable logs and surface a restrained degraded-connection state while reconnecting.
  - When a `STATUS` log arrives, read only its `{ status, completedAt }` payload into the current try; retain the log in the timeline. Terminal `COMPLETED`, `FAILED`, or `CANCELLED` is monotonic in the client: late active events cannot move it back to `STARTING`/`RUNNING`. Terminal transition closes SSE and causes `GameStreamView` to unmount.
  - Expose an idempotent `loadOlder` that requests `beforeId` from the oldest loaded log, prepends unique rows, respects `hasMore`, and prevents concurrent duplicate requests.
  - Keep initial-load failure, older-history-page failure, and live-SSE degradation distinct. A page-load failure may replace the page; history or live failures must preserve all readable logs and offer the relevant retry/reconnection state.

- [x] **Step 3: Build the QA Try route and live/log-only layouts**
  - Add `src/qa/QaTryPage.tsx` and register `/projects/:projectId/qa-tries/:qaTryId` in `src/App.tsx`; key the route by `qaTryId` so changing tries resets transports and cursors.
  - Validate the QA Try route ID as a decimal string before requests. Provide explicit loading, inaccessible/missing, malformed, empty-log, and retry states with a project back link.
  - For `STARTING` and `RUNNING`, use a two-pane Replay Studio layout: unchanged `GameStreamView instanceId={qaTry.gameInstanceId}` plus the evidence log panel. Show textual Live/Starting state and SSE degradation separately from WebRTC state.
  - For `COMPLETED`, `FAILED`, and `CANCELLED`, do not mount `GameStreamView` or `EventSource`; use the full content width for persisted logs. Status is execution context, not a computed pass/fail result, and `COMPLETED` must read as ended rather than passed.
  - Add `src/qa/QaLogTimeline.tsx` and a focused row/inspector composition only if the payload needs expansion; avoid speculative shared primitives.
  - Render every row with timestamp, direction, type label/icon, user-facing `message`, and an expandable JSON payload. `ACTION` highlights its message and JSON-RPC method/params; `ACTION_RESULT` identifies the correlation without attempting pass/fail judgment.
  - Keep raw payload collapsed by default, serialize it defensively, cap the collapsed preview by lines/characters, and wrap long tokens so a large or malformed payload cannot freeze layout or create page-wide horizontal overflow.
  - Preserve chronological DOM/focus order. Use `Intl.DateTimeFormat`, tabular-number timestamps, `translate="no"` for IDs/methods, `break-words` for untrusted messages, and semantic buttons/details.

- [x] **Step 4: Add upward infinite scroll with anchoring**
  - Place a top sentinel before the oldest row and observe it with `IntersectionObserver`; also provide a keyboard-accessible `Load older logs` button as a deterministic fallback.
  - After the initial latest-50 render, scroll once to the newest row without smooth animation. Do not repeat this initialization after paging, SSE delivery, or rerender.
  - Give each older-page request one anchor snapshot (`scrollHeight`, `scrollTop`, request/cursor token). After that request's unique rows commit, restore `scrollTop += newScrollHeight - oldScrollHeight` exactly once and clear the token; ignore stale/duplicate completions.
  - SSE appends that arrive during an older-page request must not be counted as prepended height. Track the previously visible anchor row (or isolate the prepended block's measured height) so concurrent tail growth cannot shift the reader.
  - Do not auto-jump to the bottom merely because SSE appends a row. Follow live output only while the reader is already near the live edge; otherwise show a `New logs` control that returns to the live edge.
  - Keep paging state outside row rendering. Guard end-of-history, retryable page failures, unmounts, status changes, duplicate cursors, and rapid observer callbacks.
  - Prevent sentinel loops by unobserving/disabling while a page is loading, after `hasMore=false`, after an unchanged/duplicate cursor, and after a page error until an explicit retry or a fresh intersection occurs.
  - Apply `content-visibility: auto`/containment as a paint optimization only. Accept the MVP's unbounded retained DOM explicitly, profile at 1,000 rows, and create follow-up work for a retained-window/virtualized list if interaction or memory becomes unacceptable; virtualization plus prepend anchoring is out of this issue.

- [x] **Step 5: Apply Replay Studio styling and accessibility**
  - Add scoped QA styles in `src/App.css` unless the implementation reveals a clean domain stylesheet boundary; use only existing semantic CSS variables and add missing semantic tokens (for example agent reasoning violet) to `src/styles/tokens.css`.
  - Keep the live viewer primary at desktop widths, collapse to a viewer-first single column below 1024px, and make terminal logs readable without an empty video region. Verify at 1024px and at least 1440px.
  - Use minimum 32px controls, visible `:focus-visible`, icon-plus-text type/status labels, and `aria-busy` on page/pagination loads.
  - Use one restrained `aria-live="polite"` region for connection/terminal summaries and the `New logs` count; do not announce every streamed log.
  - Ensure expandable raw payloads are keyboard operable, long JSON does not create horizontal page scrolling, and reduced-motion rules cover live indicators.

- [x] **Step 6: Tests and review**
  - Since no automated test script or test dependency exists, do not add a framework solely for this issue. Keep parsers and merge/cursor helpers pure so they can gain focused unit tests when the project adopts a runner.
  - Manually exercise: route switch during pending fetch/SSE, initial scroll to newest, active initial load with `afterId`, latest 50 ordering, repeated upward loads, one-time stable scroll anchor while SSE appends, sentinel loop prevention, no-more state, duplicate SSE/REST log ID, new-log badge away from live edge, native `Last-Event-ID` disconnect/replay, monotonic `STATUS` active-to-terminal transition, direct terminal-route load, preserved logs on live/history errors, empty logs, 404, malformed payload, very large payload, and 1,000 retained rows.
  - Run `npm run lint`, `npm run typecheck`, and `npm run build`.
  - Inspect the complete diff and run the repository's required plan/pair review workflow before PR creation.

- [x] **Step 7: Rollout / Rollback**
  - Merge/deploy ARTEL-121 before or with ARTEL-120 so the route never ships against missing endpoints.
  - No migration, feature flag, or existing-route behavior change is required on the frontend. The new route is additive and only opens live transports after a successful active-try read.
  - Roll back by reverting the ARTEL-120 frontend commit(s), which removes the route and QA module while leaving `GameStreamView` and existing pages untouched.

## Validation

- **Commands to run:**
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run dev` for manual browser checks against an ARTEL-121-compatible server
- **Expected output:**
  - ESLint, TypeScript project build, and Vite production build exit successfully.
  - Active tries show live Unity video and append logs deduplicated solely by `qa_log.id`; terminal tries open neither WebRTC nor SSE.
  - The first view contains at most the latest 50 logs; reaching the top loads older pages via `beforeId` without moving the evidence that was under the reader's focus.
  - All page, transport, empty, and pagination failure states remain navigable and understandable without color or pointer input.

## Risks & Rollback

- **Risks:**
  - A deployed ARTEL-121 version that differs from the locked paths, DTOs, cursor semantics, or event naming will block this frontend; implementation must not guess around a mismatch.
  - Replay depends on the server emitting `id: qa_log.id` and honoring native `Last-Event-ID`; missing either behavior creates a gap after disconnect.
  - A busy run retains an unbounded DOM in this MVP. Containment reduces paint work only; the 1,000-row manual threshold determines whether a separate retained-window/virtualization issue is required before release.
  - Prepend anchoring can jump if expandable payloads or fonts change height between measurement and commit; anchor restoration must happen synchronously after prepend and expansion must be user-driven.
  - `GameStreamView` has its own takeover semantics, so opening the same active try in multiple tabs can displace another viewer even though log SSE remains healthy.
- **Rollback steps:**
  - Revert the ARTEL-120 commit(s) or remove the additive route and `src/qa/` module.
  - No data rollback is needed; the frontend writes no QA data and does not alter the ARTEL-121 schema.

## Open Questions

- Confirm whether ARTEL-121 guarantees an initial `GAME_STATE` or `STATUS` log. Chronological ties use the authoritative `qa_log.id`.
- No product entry point is included: this issue adds a deep-linkable/manual QA Try detail URL only.
