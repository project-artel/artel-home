# Project Context

Fill this document during project initialization. Agents must verify commands against repository configuration before running them.

## Overview

- Product: artel-home
- Primary users: Game QA engineers and developers reviewing automated test sessions
- Core domain: Unity game QA replay, agent activity, and evidence inspection
- Runtime environment: Browser application built with React, TypeScript, and Vite

## Architecture

- Entry points: `index.html`, `src/main.tsx`
- Main modules: Application shell in `src/App.tsx`; shared semantic styles in `src/styles/`
- Dependency direction: Application UI depends on shared styles; future domain components should depend on design-system primitives
- External systems: GitHub repository `project-artel/artel-home`; Jira project `ARTEL` via the `mcp-atlassian` MCP server
- Persistent data: TODO

## Commands

| Purpose | Command |
|---|---|
| Install dependencies | `npm install` |
| Run locally | `npm run dev` |
| Format | Not configured |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Unit tests | Not configured |
| Integration tests | Not configured |
| Build | `npm run build` |
| Set up Jira credentials | `cp .jira.env.example .jira.env` |

Jira access goes through the `mcp-atlassian` MCP server, declared in `.mcp.json`
at the repository root. Claude Code starts it on demand and asks for approval
the first time it connects.

Credentials live in `.jira.env`, which the server reads through `--env-file`.
Copy `.jira.env.example` and fill in `JIRA_URL`, `JIRA_USERNAME`, and
`JIRA_API_TOKEN`, issuing the token at
`https://id.atlassian.com/manage-profile/security/api-tokens`. `.gitignore`
excludes `.jira.env`; never commit it.

The server reads that file itself, so the setup does not depend on how Claude
Code was launched or on which shell exports the variables. Do not register a
`jira` server in user scope as well, or two copies start.

## Constraints

- Supported platforms: Modern desktop and mobile browsers
- Compatibility requirements: Node.js 20.19 or newer for local tooling
- Performance constraints:
- Security or privacy requirements:

## Ownership

- Maintainers:
- Sensitive modules:
- Changes requiring explicit review:
