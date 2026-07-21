# ARTEL Home

The React frontend for ARTEL Replay Studio.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer

## Getting started

```bash
npm install
npm run dev
```

Vite prints the local development URL after the server starts.

## Commands

| Purpose | Command |
|---|---|
| Start the development server | `npm run dev` |
| Lint source files | `npm run lint` |
| Type-check the project | `npm run typecheck` |
| Create a production build | `npm run build` |
| Preview the production build | `npm run preview` |

## Project structure

```text
src/
  styles/       Global styles and semantic design tokens
  App.tsx       Application shell and initial empty state
  main.tsx      React entry point
```

UI work must follow [`.agents/docs/DESIGN.md`](.agents/docs/DESIGN.md).

## Authentication

Artel Home starts authentication through the orchestration server and keeps the
resulting JWT in a Secure, HttpOnly cookie named `artel_access_token`. The
browser does not persist or read the raw token.

Set `VITE_ORCHESTRATION_URL` to the public orchestration-server origin. It
defaults to `http://localhost:8080` for local development.

OAuth providers are declared in `src/auth/oauthProviders.ts`. GitHub is the
only enabled provider today; adding another provider requires a corresponding
Spring Security client registration and identity mapper on the orchestration
server.

`AuthUser.id` is an opaque internal user ID. One user can link several OAuth
providers, so the ID carries no provider prefix and must never be parsed or
used to infer the provider — read `provider` when the account origin matters.

Access tokens expire after 15 minutes. Every authenticated request must go
through `apiFetch` in `src/auth/authApi.ts` so a `401` returns the app to the
login boundary in one place.

### Deployment requirements

Home and the orchestration server must be deployed as **subdomains of one
registrable domain** (for example `app.artel.io` and `api.artel.io`). The
session cookie is `SameSite=Lax`, which the browser attaches only on same-site
requests — a different registrable domain would strip it from
`GET /api/auth/me` and make every session lookup return `401`. Local
development hides this because `localhost:5173` and `localhost:8080` are
same-site regardless of port.

Two consequences follow:

- Both origins must be served over **HTTPS** in production. Under schemeful
  same-site, `http` and `https` count as different sites.
- Same-site is **not** same-origin, so CORS is still required. The server must
  echo the exact Home origin in `Access-Control-Allow-Origin` (never `*`) and
  send `Access-Control-Allow-Credentials: true`.

Failed callbacks redirect to `{HOME}/login?error=oauth|server`. Home has no
router, so static hosting must rewrite unknown paths to `index.html`; without
that fallback `/login` serves a hosting 404 instead of the login screen.
