# Project Agent Instructions

## Scope and Precedence

This file is the repository-level entrypoint for coding agents.

Read `.agents/docs/project.md` before non-trivial
work. Repository-specific commands, constraints, and narrower instructions take
precedence over these template defaults.

Before designing or changing React UI, Replay Studio, QA timeline, evidence, or
agent-status interfaces, read `.agents/docs/DESIGN.md` and follow its semantic
tokens, layouts, components, states, and accessibility rules unless the task
explicitly requires otherwise.

## Project Workflow

For non-trivial work, follow:

- `.agents/docs/workflow.md`
- `.agents/docs/testing.md`

Coding conventions:

- `.agents/docs/coding-style.md`

For tracked Git work, follow:

- `.agents/docs/issue.md`
- `.agents/docs/commit.md`
- `.agents/docs/pull-request.md`

Use project-local skills when installed and applicable. Skill instructions
define their own triggers, formats, and output paths.

## Logged-in screens

Every screen here is behind a session, and there is no way to log in locally
without a registered GitHub OAuth app. `.agents/docs/pull-request.md` still asks
for a screenshot against a running stack, so the session comes from a token
minted with the local server's own signing secret.

```bash
.claude/skills/artel-jwt/mint-jwt.py --sub <app_user.id> --ttl 8h --format browser
```

That prints a `document.cookie = ...` line to paste into the DevTools console;
the page reloads logged in. Give it a TTL longer than the 15-minute default or
the session expires mid-capture. `--format playwright` prints the same cookie for
a driven browser.

The `artel-jwt` skill covers the rest: which of the four tokens goes where, and
why admin access is a database column rather than a claim. It mints for a local
server only.

## Terminology in comments, documents, and pull requests

Keep a technical term in English, in backticks, even in the middle of a Korean
sentence: `pulse`, `screen`, `capability`, `anchor`, `branch`, `fold`,
`discriminator`, `evidence`, `wiring`.

Do not invent a Korean substitute for something the code already names. `판독`
for `pulse`, `갈래` for `branch`, `배선` for `wiring`, `판별자` for
`discriminator`, `근거 문서` for an `evidence` document — none of these.

**How common a coinage is in this repository is not an argument for writing
another one.** Several of them are already widespread here. That is history, not
a standard: it means the habit spread before anyone stopped it, and matching it
spreads it further. When you write a new comment, choose the English word even
when the file beside it does not.

The one exception is a sentence you are editing that already uses the old word,
where changing it would leave a single paragraph speaking two ways. Match the
line you are touching; do not convert the file around it as a side errand.

This is not a push toward more English or more Korean. Prose stays whatever
reads naturally. The rule is narrower than that: a thing the code names keeps
the name the code gave it.
