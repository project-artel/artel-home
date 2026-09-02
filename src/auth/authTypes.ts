import type { Locale } from '../i18n/locale'

/** One OAuth account linked to a user. A user may link several over time. */
export type LinkedIdentity = {
  provider: string
  login: string
  displayName: string
  avatarUrl: string | null
}

export type AuthUser = {
  /**
   * Opaque internal user ID owned by the orchestration server. Never parse,
   * split, or infer a provider from it: one user can link several OAuth
   * providers, so this value carries no provider prefix and its format is
   * free to change. Read `identities` when the origin of an account matters.
   */
  id: string
  displayName: string
  email: string | null
  /**
   * The name the user chose on the account settings screen. The server
   * guarantees every user has one: a new account gets one at creation, and
   * an existing account was backfilled from its provider display name — so
   * this is never empty and no renderer needs a fallback for it.
   */
  nickname: string
  /**
   * The `discriminator` half of the person's canonical `nickname#userTag`
   * form — see [composeNicknameTag]. The server assigns it, usually as four
   * digits, and grows the width when a popular nickname runs out of that
   * space, so the client never assumes a fixed length or pads one itself.
   * Always present, the same way `nickname` always is.
   */
  userTag: string
  /**
   * The UI language stored on the account, or `null` when the user has never
   * chosen one — the client then falls back to its own detection.
   */
  locale: Locale | null
  /** Sorted by the server with the most recently used provider first. */
  identities: LinkedIdentity[]
}

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated'; user: null }
  | { status: 'error'; user: null }

/** What the account settings screen sends to `PUT /api/auth/me/profile`. */
export type AccountProfileDraft = {
  nickname: string
}

/**
 * The width of `app_user.nickname`, which `ARTEL-730` set to `VARCHAR(64)`.
 * The server answers a longer value with `400 invalid_nickname`, so the field
 * caps the input at this length instead of letting the user type a name that
 * can only fail on save.
 */
export const NICKNAME_MAX_LENGTH = 64

/**
 * Turns the form field into the wire shape. Trims surrounding whitespace but
 * does not reject a blank result — the caller checks that separately, while
 * it still has a field to blame for the failure (`save` in
 * `AccountSettingsPage.tsx`), before this value ever reaches the server.
 */
export function toAccountProfileDraft(nickname: string): AccountProfileDraft {
  return { nickname: nickname.trim() }
}

/**
 * `Yuni#0042` — the one way this repository writes a person's chosen name.
 * Every screen that names a user by nickname composes it through here rather
 * than templating the two fields itself, so there is exactly one place that
 * knows the separator and the server's `userTag` never gets padded, sliced,
 * or otherwise assumed to be four digits wide.
 */
export function composeNicknameTag(nickname: string, userTag: string): string {
  return `${nickname}#${userTag}`
}
