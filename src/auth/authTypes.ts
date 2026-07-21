export type AuthUser = {
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
