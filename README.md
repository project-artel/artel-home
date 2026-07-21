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
resulting JWT in a Secure, HttpOnly cookie. The browser does not persist or read
the raw token.

Set `VITE_ORCHESTRATION_URL` to the public orchestration-server origin. It
defaults to `http://localhost:8080` for local development.

OAuth providers are declared in `src/auth/oauthProviders.ts`. GitHub is the
only enabled provider today; adding another provider requires a corresponding
Spring Security client registration and identity mapper on the orchestration
server.
