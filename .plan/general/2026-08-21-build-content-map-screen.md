# 2026-08-21 — 빌드 콘텐츠 맵 화면

- Date: 2026-08-21
- Jira: ARTEL-489 ([Home] 빌드의 씬 명세를 올리고 본다)
- Status: Implemented

## Goal

Give one game build a screen that shows what the server made of its evidence:
how many scenes the build has, how many capabilities sit in each one and in
what state, which gaps were recorded, how much of it is verified, and how the
scenes lead into one another.

Nobody picks a file. The console asks a connected game instance to rescan; the
SDK uploads the evidence itself and the server ingests it. So this screen is a
read surface plus one trigger button.

## Non-goals

- **Any upload UI.** No `<input type="file">`, no presigned PUT, no ticket or
  register call. The SDK owns that path end to end.
- Client-driven ingest. The server ingests what the SDK sends.
- Editing the content map.
- New npm packages. No graph library — the deterministic layout in
  `src/knowledge/knowledgeLayout.ts` is parametrised and reused.
- Polling. `pendingDocuments` is surfaced as a standing fact; refresh is manual.
- Pan/zoom on the scene graph.

## Context / Constraints

The only endpoint this screen consumes (Notion, "Content Map" API rows):

```
GET /api/projects/{projectId}/game-builds/{gameBuildId}/content-map
     → { contentMap: {id, capture, schemaVersion, evidenceDigest, unity,
                      platform, sdkVersion, ingestedAt} | null,
         scenes[{id, name, walked,
                 capabilities:{total,runnable,needsProbe,notAStep,
                               unreachablePrecondition}}],
         edges[{fromSceneId, toSceneName, toSceneId, capabilityId, source,
                verifiedAt}],
         gaps[{reason, count}], verification:{verified,total},
         pendingDocuments[{documentId, receivedAt, ingestFailedAt, ingestError}] }
```

- **Ids are numbers (Long)** on these endpoints, not strings. The parser accepts
  both and normalises to string, because every id downstream is a map key, a
  React key, and a URL segment.
- `contentMap === null` → never scanned. `ingestedAt === null` → a document
  arrived but has not been ingested. Two different screens.
- `source` is `static | runtime` today and is an open vocabulary tomorrow.
  Anything else must draw and must be named verbatim.
- `gaps[].reason` has no published vocabulary at all → rendered verbatim.
- Capability status keys beyond the four named ones are **ignored**, not
  promoted. An earlier draft folded every unrecognised numeric key into an
  `other` bucket and into `total`; any non-status number the server later adds
  to `capabilities` (a version, an id) would then render as a capability state
  and inflate the count. Reversed during review — see the change log.

Repository constraints:

- `.agents/docs/DESIGN.md`: semantic tokens only, **no raw hex in TSX**, no box
  shadows, no repeated rounded cards, colour never alone carries meaning, the
  five states defined, and a visual annotation needs an accessible list
  equivalent.
- Parsing vocabulary: `asRecord` / `asString` / `isOneOf` / `readJson` /
  `jsonRequest` / `ProjectApiError` from `src/projects/projectApi.ts`.
- The rescan trigger has **no server contract yet**. It is isolated in
  `src/contentMap/requestEvidenceScan.ts` behind a TODO so that wiring it up
  later touches one function and no component.
- Tests are `node --test` over `src/**/*.test.ts` — pure modules only.
- Comments in Korean (`.agents/docs/coding-style.md`).

## Approach (Checklist)

- [x] **Step 1: parametrise the knowledge layout.**
  `src/knowledge/knowledgeLayout.ts` becomes generic over
  `N extends LayoutNode ({id})` and `E extends LayoutEdge ({from,to})`, with the
  existing `KnowledgeNode`/`KnowledgeEdge` as defaults so every current caller
  and the existing test compile unchanged. `layoutKnowledgeGraph` stays as a
  thin wrapper over the new `layoutGraph`. `placeLabels` becomes generic the
  same way.
- [x] **Step 2: `src/contentMap/contentMapTypes.ts`** — view models for the four
  payloads. Open vocabularies (`source`, `capture`, gap `reason`, extra
  capability statuses) stay plain strings with a `known…` predicate used only to
  pick ink.
- [x] **Step 3: `src/contentMap/contentMapApi.ts`** — tolerant parsing plus the
  four calls. `asId` accepts number or string. A scene missing `id` is dropped;
  an edge whose `fromSceneId` is missing is dropped; everything else degrades.
- [x] **Step 4: `src/contentMap/sceneGraphLayout.ts`** (+ `.test.ts`) — pure.
  Turns `scenes` + `edges` into the graph the layout takes: a node per scene, a
  synthesised "named only" node for a transition whose `toSceneId` is null and
  whose name matches no scene, self edges and parallel edges preserved. Also
  `edgeSourceStyle()` — `static | runtime | other`.
- [x] **Step 5: `src/contentMap/useContentMap.ts`** — one read keyed on
  `projectId:buildId`, `reload`, and an `online` flag from the browser so a lost
  network is reported rather than shown as a live map.
- [x] **Step 6: components** — `ContentMapPage.tsx` (route + the five states),
  `EvidenceScanPanel.tsx` (one `Rescan evidence` button over the project's
  connected game instances, disabled with a stated reason when there is nothing
  to scan, plus the pending-document list), `ContentMapSummary.tsx`,
  `SceneGraphCanvas.tsx` (aria-hidden), `SceneGraphInspector.tsx` (the
  accessible equivalent), `SceneGraphLegend.tsx`.
- [x] **Step 7: wiring** — route in `src/App.tsx`, link in the build row's
  `.form-actions` in `src/projects/GameBuildPanel.tsx`, `src/i18n/messages/
  contentMap.ts` (en + ko) registered in `src/i18n/messages.ts`, `cm-` styles in
  `src/App.css`.
- [x] **Step 8: validate** — `npm run lint && npm run typecheck && npm test`.

## The five states, and where each is decided

| State | Decided from |
|---|---|
| Loading | no snapshot yet for the current `projectId:buildId` key |
| Error | the `GET` rejected and there is no snapshot to fall back on |
| Empty | `contentMap === null` (never scanned) — points at the scan panel |
| Empty, second kind | `contentMap !== null && ingestedAt !== null && scenes.length === 0` — the document was ingested and described no scene |
| Arrived, not ingested | `contentMap !== null && ingestedAt === null` — the server has the document but no rows are seated yet |
| Degraded | a map is on screen **and** `pendingDocuments.length > 0`, the per-document `ingestError` is shown verbatim |
| Disconnected | `navigator.onLine === false`, or a refresh failed while a snapshot is showing — the map stays visible, marked as of its fetch time, never as live |

## What was actually built

- `src/knowledge/knowledgeLayout.ts` gained `LayoutNode` / `LayoutEdge` and a
  generic `layoutGraph<N, E>`; `layoutKnowledgeGraph` is now a one-line wrapper,
  so every existing caller and `knowledgeLayout.test.ts` are untouched.
  `placeLabels` and `incidentEdges` are generic the same way.
- `src/contentMap/` holds the types, the tolerant parser, the pure
  `sceneGraphLayout.ts` + its `node:test` file, `contentMapApi.test.ts`, the
  hook, the isolated scan trigger, and six components.
- `contentMapApi.ts` is read-only: one `GET` and the parsers. The rescan call
  lives alone in `requestEvidenceScan.ts` and currently rejects with
  `CLIENT_SCAN_NOT_IMPLEMENTED` rather than pretending to have started
  something. The panel renders that rejection like any other server failure, so
  the day the endpoint lands only that one function changes.
- The scan button is disabled for four distinct reasons — still checking, the
  instance list failed, no game has ever connected, no game is connected right
  now — and says which. Each one has a different next action.
- `sceneHue` moved out of `SceneChip.tsx` into `src/testCases/sceneHue.ts` so
  that file keeps exporting components only (fast refresh), and the content map
  draws each scene in the same colour the case library and the run map use.
- Refreshing keeps the previous snapshot on screen. Only the first load, or a
  move to a different build, blanks the page.

## Validation

| Command | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm test` | 102 tests, 0 failures (17 layout + 15 parser are new) |
| `npm run build` | passes |
| `npm run lint` | 7 errors + 2 warnings, **all pre-existing** and all in files this change does not touch (`src/i18n/messages/scenarios.ts`, `src/testCases/TestCaseModal.tsx`, `src/testCases/TestCaseSpecModal.tsx`, `src/testRuns/RunMapPage.tsx`, `src/testRuns/RunNameCrumb.tsx`, `src/testScenarios/TestScenarioPage.tsx`, `src/testScenarios/useStepEditor.ts`). Identical count before and after; this change adds none. Fixing them is a behavioural refactor of unrelated screens and belongs to its own issue. |

Nothing was verified against a live server — the server side is being written in
parallel. Every payload assertion above is against the published contract, not
against a real response.

## Contract feedback for the server side

0. **The rescan trigger has no endpoint.** The screen is finished around a
   stub. Whatever shape it takes, it needs to name the game instance and the
   build, and to tell the console whether the scan was accepted — otherwise the
   button can only ever say "requested".
1. **`gaps[].reason` has no published vocabulary.** The screen prints the raw
   string in mono because inventing a label would invent a meaning. A list of
   the reasons the server can emit would let this read as prose.
2. **`capture` and `schemaVersion` have no stated type.** Parsed permissively
   (number or string) and shown verbatim. Worth pinning.
3. **`edges[]` carries no id.** Parallel transitions between the same pair are
   de-duplicated on `(from, to, capabilityId, source)`, which is a guess at
   identity. An edge id would make selection and de-duplication exact.
4. **`edges[].toSceneId` may be null** while `toSceneName` names a scene that is
   not in `scenes[]`. The screen draws a placeholder node so the transition
   stays visible; a flag saying whether the destination is expected to appear
   later would let it say which.
5. **Nothing reports ingest progress or completion.** `pendingDocuments` is the
   only signal that work is outstanding, and it only changes on a refresh. The
   screen therefore cannot tell a user when a scan they just requested has
   landed; it can only invite them to refresh.

## Risks

- The server side is in flight, so nothing here is verified end to end. Every
  parse degrades rather than throwing, and the fixture used for manual checking
  stays out of the production path.
- `capture` and `schemaVersion` have unstated types. Parsed permissively
  (number or string → string) and rendered verbatim in mono.

## Rollback

Delete `src/contentMap/`, the `contentMap` i18n module, `src/testCases/sceneHue.ts`
(folding it back into `SceneChip.tsx`), the route, the build-row link, and the
`cm-` CSS block. The layout generalisation is behaviour-preserving and can stay.

## Change log

- **2026-08-21** — the Jira key is `ARTEL-489`. It was briefly changed to
  `ARTEL-490` and changed back: two Jira sites carry the same key range with
  different content (`artel-asm` is the retired one, `artel-sm` is live), and a
  stale `JIRA_BASE_URL` in the shell environment pointed a lookup at the retired
  site. On the live site `ARTEL-490` and `ARTEL-491` are the SDK issues and
  `ARTEL-492` is the orchestration scan trigger this screen's button will call.
- **2026-08-21** — the upload flow was dropped mid-implementation. The SDK now
  uploads evidence itself after a scan the console triggers, so
  `EvidenceUploadPanel.tsx`, `uploadEvidence.ts`, the ticket/register/ingest
  calls and their types and tests were removed, and `putToStorage` in
  `src/projects/uploadDocument.ts` went back to being private. The read and the
  visualisation — the body of this issue — were unaffected.
- **2026-08-21** — review findings folded in: the unrecognised-status `other`
  bucket was removed outright, `game.connected` is now presented as a dated
  snapshot rather than a live fact, the scene-graph placeholder no longer keeps
  an empty name when a later edge supplies one, and the Korean transition list
  says direction in words instead of a bare arrow glyph.
