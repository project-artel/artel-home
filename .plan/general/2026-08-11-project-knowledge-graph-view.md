# 2026-08-11 — 프로젝트 지식창고 그래프 화면

- Date: 2026-08-11
- GitHub Issue: None (Jira key not assigned yet; branch name omits it)
- Status: Draft

## Goal

Give a project's knowledge base a screen. Today the items the QA agent accumulates
and the relations it asserts between them exist only in the database — there is no
list, let alone a picture. The new page draws the whole graph at once, lets a
person select a node to read the item behind it, and lets them select an edge to
read the `note` that is the only stated reason that relation exists.

## Non-goals

- Editing knowledge or relations. This is a read surface.
- Server changes. `GET /api/projects/{projectId}/knowledge-graph` is consumed as
  specified; a contract mismatch is reported, not patched.
- New npm packages. The layout and the rendering are written by hand against
  `react`, `react-dom`, `react-router-dom`.
- Pan/zoom, clustering, filtering, search. The brief asks for the whole graph on
  one screen; anything beyond that is a later question.

## Context / Constraints

Contract:

```
GET /api/projects/{projectId}/knowledge-graph?nodeLimit=200
{ projectId, nodes[{id,tag,source,summary,version,createdByQaTryId,createdAt}],
  edges[{from,to,relation,note}], truncated, nodeLimit }
```

- `relation` and `tag` are open strings. An unknown value must degrade, never break.
- `truncated: true` means nodes were cut **and edges touching them are absent**.
  The screen must not present the result as complete.
- Deleted knowledge is absent; the response is the live set.
- Auth rides the existing session cookie through `apiFetch`.

Repository constraints:

- `.agents/docs/DESIGN.md`: semantic tokens only, no raw hex in TSX, no box
  shadows, colour never carries meaning alone, loading/empty/error states
  defined, accessible list alternative for visual annotations.
- Parsing follows the `asRecord` / `asString` / `isOneOf` vocabulary in
  `src/projects/projectApi.ts`.
- `package.json` has no test runner. Node 24 runs `node --test` over `.ts`
  directly (type stripping is on by default), so the logic can be covered
  without adding a dependency.

## Approach (Checklist)

- [ ] **Step 0: Recon** — `src/issues/*` for the page/api/hook shape,
      `src/testRuns/RunMapPage.tsx` for existing SVG drawing, `src/App.tsx` for
      routing, `src/i18n/messages/*` for strings, `src/App.css` for the section
      convention.
- [ ] **Step 1: Implementation**
  - `src/knowledge/knowledgeTypes.ts` — view models; relation/tag/source kept as
    open strings with a `known…` predicate for styling only.
  - `src/knowledge/knowledgeApi.ts` — `getKnowledgeGraph`; drops unusable rows
    instead of failing the page; drops edges whose endpoints are not in the node
    set, which is what truncation produces.
  - `src/knowledge/knowledgeLayout.ts` — pure layout. **Deterministic, not
    force-directed** (rationale below). Handles self-edges, parallel edges, and
    reversed pairs so no relation is hidden under another.
  - `src/knowledge/useKnowledgeGraph.ts` — load/abort/retry, mirroring
    `useIssues.ts`.
  - `src/knowledge/KnowledgeGraphCanvas.tsx` — the SVG.
  - `src/knowledge/KnowledgeInspector.tsx` — selection detail + the item list
    that is the keyboard and screen-reader path into the drawing.
  - `src/knowledge/KnowledgeGraphPage.tsx` + route
    `/projects/:projectId/knowledge` in `src/App.tsx`, entry point from the
    project header next to Issues.
  - `src/i18n/messages/knowledge.ts` wired into `src/i18n/messages.ts`.
  - `src/App.css` — a `Knowledge graph` section using existing tokens.
- [ ] **Step 2: Tests** — `node --test`, covering the layout (empty graph, no
      edges, self-edge, parallel and reversed pairs, determinism) and the parser
      (unknown relation/tag, missing fields, dangling edge, duplicate ids).
- [ ] **Step 3: Rollout / Rollback** — additive route and additive link; revert
      the commit to remove it.

### Why a deterministic layout, not force-directed

A force simulation over ~200 nodes needs an iteration budget and a stopping rule
to stay off the frame budget, and its output is unstable: the same graph draws
differently on every visit, so nothing a person learns about the picture survives
a reload, and the layout cannot be asserted in a test. The graph here has real
structure to draw instead — the components are what "what does this project know"
actually looks like. So: union-find components, BFS depth rings inside each
component from a stable root, components packed by size, isolated items in a grid
of their own. One pass, no animation, same input gives the same picture.

## Validation

- **Commands to run:** `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`
- **Expected output:** clean; tests pass. Manual check on a dev server started on
  a spare port (5173 and 8080 are already occupied and must not be disturbed).

## Risks & Rollback

- **Risks:**
  - The endpoint could not be found in `artel-orchestration-server` on any branch,
    so the page is written to the stated contract and is unverified against a live
    response. Reported rather than worked around.
  - A dense component still overlaps at 200 nodes; the drawing stays readable
    because labels are suppressed above a threshold, but it is not a substitute
    for filtering, which is out of scope.
- **Rollback steps:** `git revert` the commit. Nothing else references the new
  module.

## Open Questions

- Jira key for the branch/PR trailer.
- Whether `nodeLimit` should be user-adjustable once truncation is common.
