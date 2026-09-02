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
   * Whether `email` has completed the `ARTEL-733` verification step. `false`
   * whenever `email` is `null` — an unset address is never verified — and also
   * `false` for a session the server described before `ARTEL-732` added this
   * field, so an old session degrades to "cannot receive invitations" rather
   * than a false positive.
   */
  emailVerified: boolean
  /**
   * An address `POST /api/auth/me/email` accepted but that has not yet been
   * confirmed through `POST /api/auth/me/email/verify`, or `null` when no
   * registration is in flight. Distinct from `email`: registering a new
   * address while a previous one is already verified leaves `email` pointing
   * at the still-active address until this one is confirmed.
   */
  pendingEmail: string | null
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
 * `320` is the widest an email address can be under RFC 5321 (64 for the
 * local part, `@`, 255 for the domain), and matches
 * `INVITATION_EMAIL_MAX_LENGTH` in `memberTypes.ts` — the two flows land on
 * the same server-side column width.
 */
export const EMAIL_MAX_LENGTH = 320

/**
 * Local part, `@`, domain part with at least one `.` — deliberately looser
 * than the full RFC 5322 grammar. This only has to catch an obviously
 * malformed address before it reaches the server; the server is the actual
 * authority on whether an address is deliverable.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Only for a non-empty candidate — the caller trims the draft and turns an
 * empty result into "nothing to register" before this ever runs.
 */
export function isEmailValid(value: string): boolean {
  return EMAIL_PATTERN.test(value) && value.length <= EMAIL_MAX_LENGTH
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
