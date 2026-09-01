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
   * The name the user chose on the account settings screen, or `null` when
   * they have never set one — every renderer falls back to `displayName`
   * rather than showing an empty value.
   */
  nickname: string | null
  /**
   * A `Name#1234` handle, or `null` when the user has never set one. Format
   * is enforced only in the browser, by [isBattleTagValid]; the server stores
   * whatever a valid save sent and this type does not re-check it on read.
   */
  battleTag: string | null
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

/**
 * What the account settings screen sends to `PUT /api/auth/me/profile`. Both
 * fields are always sent together — the endpoint has no partial-update form —
 * so this is not a `Partial<...>` the way `ProjectPatch` is over `ProjectDraft`.
 */
export type AccountProfileDraft = {
  nickname: string | null
  battleTag: string | null
}

/**
 * Name of 1 to 24 characters, then `#`, then 1 to 8 digits — the format
 * `ARTEL-730` stores on `app_user.battle_tag`. The name excludes `#` itself,
 * so a stray second `#` in the input cannot be swallowed into the name half
 * and still pass.
 */
const BATTLE_TAG_PATTERN = /^[^#]{1,24}#\d{1,8}$/

/**
 * The width of `app_user.nickname`, which `ARTEL-730` set to `VARCHAR(64)`.
 * The server answers a longer value with `400 invalid_nickname`, so the field
 * caps the input at this length instead of letting the user type a name that
 * can only fail on save.
 */
export const NICKNAME_MAX_LENGTH = 64

/**
 * Only for a non-empty candidate. Clearing the field is a valid choice on its
 * own — the screen turns an empty draft into `null` before this ever runs, so
 * an empty string is never a call site's real question.
 */
export function isBattleTagValid(value: string): boolean {
  return BATTLE_TAG_PATTERN.test(value)
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
 * Only for a non-empty candidate, the same convention [isBattleTagValid]
 * uses — the caller trims the draft and turns an empty result into "nothing
 * to register" before this ever runs.
 */
export function isEmailValid(value: string): boolean {
  return EMAIL_PATTERN.test(value) && value.length <= EMAIL_MAX_LENGTH
}

/**
 * Turns what the form fields hold into the wire shape. Both fields collapse
 * an empty (or whitespace-only) string to `null` — on this endpoint that is
 * how a user clears the value, not an omission the server should ignore.
 *
 * Does not validate the BattleTag; the caller runs [isBattleTagValid] against
 * the trimmed candidate first, while it still has a field to blame for the
 * failure. By the time a draft reaches here it is assumed already accepted.
 */
export function toAccountProfileDraft(nickname: string, battleTag: string): AccountProfileDraft {
  const trimmedNickname = nickname.trim()
  const trimmedBattleTag = battleTag.trim()

  return {
    nickname: trimmedNickname.length > 0 ? trimmedNickname : null,
    battleTag: trimmedBattleTag.length > 0 ? trimmedBattleTag : null,
  }
}

/**
 * What the screen prints in place of an unset nickname. A user who never
 * opened account settings still has a name somewhere to show, and that is
 * always `displayName` — the one field `AuthUser` never lets be empty.
 */
export function resolveDisplayNickname(user: Pick<AuthUser, 'displayName' | 'nickname'>): string {
  return user.nickname ?? user.displayName
}
