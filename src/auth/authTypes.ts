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
