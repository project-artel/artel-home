# 2026-07-19 — ARTEL-45 OAuth Login and JWT Session Integration

- Date: 2026-07-19
- Jira Issue: ARTEL-45
- Status: In Progress
- Repository: `artel-home`
- Work Type: `feat`

## Goal

Add an accessible social-login boundary to Artel Home. GitHub is the only enabled OAuth provider today, but the UI and client configuration must support adding providers without rewriting session management.

## Non-goals

- Database or user-management work.
- Username/password forms, registration, password recovery, or provider-account linking.
- Reading or persisting the raw JWT in browser JavaScript storage.
- Redesigning the Replay Studio workspace beyond authentication-aware shell controls.

## Session Contract

- A provider button navigates to `/oauth2/authorization/{registrationId}` on the orchestration server.
- The server completes OAuth, creates the JWT, stores it in a Secure/HttpOnly/SameSite=Lax cookie, and redirects home.
- Home calls `GET /api/auth/me` with `credentials: include` to resolve the current user.
- Home calls `POST /api/auth/logout` to clear the session.
- A `401` means the app must render the login experience.
- The raw JWT never enters React state, DOM, URLs, logs, `localStorage`, or IndexedDB.

## Provider Extensibility

`oauthProviders.ts` is the UI provider registry. Adding a provider adds one definition containing a stable ID, label, and login path. Authentication state and API modules remain provider-neutral.

## Approach (Checklist)

- [x] Add provider-neutral user and authentication-state types.
- [x] Add the provider registry with GitHub as the first enabled provider.
- [x] Add a credentialed authentication API for session lookup and logout.
- [x] Add `AuthProvider` and `useAuth` as the single session-state boundary.
- [x] Add loading, unauthenticated, authenticated, OAuth failure, and logout states.
- [x] Add an accessible GitHub login surface following `.agents/docs/DESIGN.md`.
- [x] Protect the Replay Studio shell by rendering it only for authenticated users.
- [x] Add normalized user identity and logout controls to the top bar.
- [x] Keep the provider button list data-driven for future OAuth providers.
- [ ] Add automated component tests when the repository test harness is introduced.
- [x] Run lint and type-check.
- [ ] Run the production build after the platform-specific Rolldown native binding is available.
- [ ] Verify the real GitHub redirect/callback/logout flow with ARTEL-44.

## Accessibility and Design Requirements

- Use semantic design tokens and no raw colors in TSX.
- Keep the login action keyboard accessible with a visible focus indicator and a minimum 44px mobile target.
- Announce OAuth failure with `role="alert"` and communicate failures with text plus a visual marker.
- Preserve WCAG AA contrast and reduced-motion behavior.
- Treat provider icons as decorative when the provider name is present in text.

## Configuration

- `VITE_ORCHESTRATION_URL` — orchestration-server public origin; defaults to `http://localhost:8080` locally.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Verify session loading, GitHub redirect, callback success, callback failure, refresh, and logout.
- Verify desktop and narrow-screen layouts with keyboard-only interaction.
- Verify no JWT appears in browser-visible storage, URLs, DOM, or console output.

## Risks / Mitigations

- **Frontend and backend origins differ:** use explicit credentialed CORS and environment-specific public origins.
- **OAuth provider is unavailable:** show a retryable provider failure without exposing backend details.
- **Additional providers have different profile fields:** keep normalization on the server; Home consumes one stable `AuthUser` shape.
- **Authentication causes broad UI churn:** isolate it in the provider, API module, and login page.

## Deferred Work

Automated browser tests, additional provider buttons, account linking, roles, and refresh-token/session-revocation behavior belong in follow-up issues.
