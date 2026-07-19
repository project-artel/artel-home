# 2026-07-19 — React 프로젝트 설정

- Date: 2026-07-19
- GitHub Issue: None
- Status: Complete

## Goal

Initialize `artel-home` as a maintainable React and TypeScript application that follows the ARTEL Replay Studio design system and can be developed, linted, type-checked, and built locally.

## Non-goals

- Implementing the full Replay Studio workflow or backend integration.
- Adding routing, state-management, or data-fetching libraries before a concrete use case exists.
- Deploying the application.

## Context / Constraints

- The repository currently contains documentation only.
- React UI must follow `.agents/docs/DESIGN.md`.
- The current WSL environment does not expose a native Node.js executable.

## Approach (Checklist)
- [x] **Step 0: Recon** (Inspect repository instructions, design rules, and available toolchain)
- [x] **Step 1: Implementation** (Add Vite, React, TypeScript, ESLint, semantic tokens, and starter UI)
- [x] **Step 2: Tests** (Install dependencies, then run lint, type-check, and production build)
- [x] **Step 3: Rollout / Rollback** (Document commands; rollback is removal or git revert of scaffold files)

## Validation
- **Commands to run:** `npm run lint`, `npm run typecheck`, `npm run build`
- **Expected output:** All commands exit successfully and Vite emits a production bundle in `dist/`.

## Risks & Rollback
- **Risks:** Dependency installation may be blocked if a compatible Node.js runtime or network access is unavailable.
- **Rollback steps:** Revert the scaffold commit or remove only the newly added React project files.

## Open Questions
- None for the initial scaffold.
