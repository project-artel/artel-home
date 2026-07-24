# ARTEL-114 — 홈 UI 한국어 영어 다국어 지원

## Goal

Support Korean and English across all user-facing UI strings, with a language
switcher in the app shell and browser-language-based default.

## Approach

Lightweight, dependency-free i18n:

- `src/i18n/locale.ts` — `Locale` type (`'en' | 'ko'`), detection
  (localStorage `artel.locale`, then `navigator.language`), persistence.
- `src/i18n/messages/common.ts|projects.ts|scenarios.ts` — per-domain
  dictionaries. English object is the source of shape; Korean is typed
  `Localized<typeof en>` so a missing key fails typecheck.
  Parameterized messages are functions returning strings.
- `src/i18n/messages.ts` — aggregates domains into `messages.en` / `messages.ko`;
  `Messages = typeof messages.en`.
- `src/i18n/LocaleContext.ts` + `LocaleProvider.tsx` + `useI18n.ts` — same file
  split as the auth module. Provider owns locale state, persists it, and sets
  `document.documentElement.lang`.
- `useI18n()` returns `{ locale, setLocale, t }`; components read `t.<domain>.<key>`
  (typed object access, no string-key lookup).

## UI

- Locale `<select>` in `AppShell` top bar (options: English, 한국어), styled like
  the existing `.logout-button`, `aria-label` localized.
- `GENRE_LABELS` moves into the projects dictionary.

## Scope

- Common: `App.tsx`, `AppShell.tsx`, `LoginPage.tsx`, `NotFoundPage.tsx`.
- `src/projects/*` and `src/testScenarios/*`: every user-visible string
  (headings, buttons, empty/error/loading states, aria-labels, dialog copy,
  client-side validation and upload errors).

## Non-goals

Server/agent message translation, locales beyond ko/en, URL-based locale,
locale-aware date formatting changes (formatters keep browser locale).

## Validation

`npm run lint`, `npm run typecheck`, `npm run build`; manual switch check.
