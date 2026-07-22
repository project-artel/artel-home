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
  auth/             Session state, credentialed fetch, OAuth provider registry
  design-system/    Shared primitives composed by domain components
  projects/         Project list, detail, and planning-document surfaces
  shell/            Signed-in chrome shared by every route
  styles/           Global styles and semantic design tokens
  App.tsx           Login boundary and the authenticated router
  main.tsx          React entry point
```

UI work must follow [`.agents/docs/DESIGN.md`](.agents/docs/DESIGN.md).

## Routes

Only the authenticated subtree is routed; the login boundary stays a plain
render so a routing fault cannot strand a signed-out user.

| Path | Screen |
|---|---|
| `/projects` | Project list and the create dialog |
| `/projects/:projectId` | Project information, planning documents |
| `/login` | Where a failed OAuth callback lands |

**Static hosting must rewrite unknown paths to `index.html`.** This was already
required for the `{HOME}/login?error=...` redirect, but it is now load-bearing
for every project deep link: without the fallback, opening or reloading
`/projects/{id}` serves a hosting 404 instead of the app.

## Planning documents

A planning document is a PDF, at most 50 MB, uploaded in three steps:

1. `POST /api/projects/{id}/documents/upload-url` returns a presigned URL.
2. The browser `PUT`s the file **directly to object storage**. This is the one
   request that must not go through `apiFetch` and must not send credentials —
   it leaves our origin, so the session cookie would leak cross-origin and the
   upload signature would break. It uses `XMLHttpRequest` because only that
   reports upload progress.
3. `POST /api/projects/{id}/documents` registers the object. **The document does
   not exist until this call succeeds**; if the session expires in between, the
   bytes are in storage but unreferenced, and the UI reports the failure rather
   than claiming success.

Uploading adds a version. Nothing is replaced, and downloads resolve a fresh
short-lived URL on click so a presigned link is never left sitting in the DOM.

## Projects and members

Users and projects are many-to-many. Each response carries `myRole`
(`OWNER` or `MEMBER`) for the requesting user; an unknown value degrades to
`MEMBER`, which hides destructive actions rather than offering ones the server
would refuse. Only an owner can delete, and deletion is soft on the server but
has no restore path in the UI, so it is treated as final. There is no member
management UI yet — the only membership the server creates is the creator's.

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
