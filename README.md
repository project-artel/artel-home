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
