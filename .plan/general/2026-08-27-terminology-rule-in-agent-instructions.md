# 2026-08-27 — [Home] 코드가 이름 붙인 용어를 그대로 쓰게 한다

- Date: 2026-08-27
- Jira: ARTEL-626 (epic ARTEL-14; relates to ARTEL-624 — orchestration server 쪽 같은 규칙)
- Branch: `docs/home-코드가-이름-붙인-용어를-그대로-쓰게-한다-ARTEL-626`
- Base: `origin/develop`
- Status: Implemented, PR not opened

## Goal

주석·문서·PR 본문에서 코드가 이미 이름 붙인 것을 한글 조어로 바꿔 부르지 않게 하는 규칙을 이 저장소의
에이전트 지침에 세운다. 규칙만 세우고, 이미 쓰인 조어를 일괄 치환하지는 않는다.

## Non-goals

- `develop` 에 이미 있는 조어를 훑어 고치지 않는다. 지금 `src/contentMap` 쪽에 `갈래`·`근거 문서`·`배선`이
  남아 있지만 이 branch 는 손대지 않는다.
- 주석과 문서의 언어 자체를 바꾸지 않는다. 문장은 계속 한국어다.
- 사용자에게 보이는 문구(`src/i18n/messages`)는 대상이 아니다.

## Context / Constraints

- `AGENTS.md` 는 `CLAUDE.md` 의 symlink 대상이라 한쪽만 고치면 둘 다 바뀐다.
- `.agents/docs/coding-style.md` 의 `### Language` 는 스스로 "This rule covers source files only" 라고
  범위를 못 박고, 문서·commit·PR 은 각자의 규약에 넘긴다. 그래서 세 갈래 산출물에 다 걸리는 규칙을
  그 안에 넣으면 그 문서가 스스로 그은 선과 부딪힌다.
- orchestration server 의 ARTEL-624 가 같은 규칙을 같은 자리(`AGENTS.md` 본문 + `coding-style.md` 에서의
  링크)에 세우고 있다. 저장소끼리 규칙이 다른 자리에 있으면 찾는 사람이 두 번 찾는다.

## Approach (Checklist)

- [x] **Step 1: 규칙 본문** — `AGENTS.md` 에 `## Terminology in comments, documents, and pull requests`
      절을 `## Project Workflow` 바로 뒤에 둔다. 어떤 문서가 무엇을 맡는지 읽은 직후에, 그 셋 모두에
      걸치는 규칙이 오게 한다.
- [x] **Step 2: 찾아가는 길** — `.agents/docs/coding-style.md` 의 `### Language` 에서 규칙 본문으로
      가는 한 줄을 더한다. 주석을 쓰는 사람이 실제로 펴 보는 문서가 거기다.

## Validation

- **Commands run:** 없음. 문서만 바뀌어 실행 가능한 검증이 없다.
- **눈으로 본 것:** `AGENTS.md` 와 `CLAUDE.md` 가 같은 파일임(symlink), `coding-style.md` 에서 건 상대 경로
  `../../AGENTS.md` 가 실제 파일을 가리킴, 기존 "주석은 한국어로 쓴다" 규칙과 모순되지 않음 — 새 규칙은
  문장을 영어로 옮기라는 것이 아니라 코드가 붙인 이름만 그대로 두라는 것이다.

## Risks & Rollback

- **Risks:** 규칙이 "영어를 더 쓰라"로 읽히면 주석 문장까지 영어로 넘어간다. 본문 마지막 문단이 그 오해를
  직접 막지만, 오해는 규칙을 안 읽은 사람에게서 난다.
- **Rollback steps:** `git revert`.

## Open Questions

- 이미 퍼진 조어를 언제 훑을지. 지금은 안 한다 — 규칙이 "고치는 김에 그 문장만" 이라고 정해 두었으니
  자연히 줄어들지, 아니면 따로 작업을 열어야 할지는 나중에 본다.
