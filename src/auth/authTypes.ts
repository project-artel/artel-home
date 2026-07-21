export type AuthUser = {
  /**
   * Opaque internal user ID owned by the orchestration server. Never parse,
   * split, or infer a provider from it: one user can link several OAuth
   * providers, so this value carries no provider prefix and its format is
   * free to change. Use `provider` when the origin of the account matters.
   */
  id: string
  provider: string
  login: string
  displayName: string
  avatarUrl: string | null
}

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated'; user: null }
  | { status: 'error'; user: null }
