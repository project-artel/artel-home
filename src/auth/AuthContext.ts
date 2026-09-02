import { createContext } from 'react'
import type { AuthState, AuthUser } from './authTypes'

export type AuthContextValue = AuthState & {
  logout: () => Promise<void>
  /**
   * Replaces the current user with what `updateMyProfile` resolved to, right
   * after that call succeeds. `PUT /api/auth/me/profile` now answers `200`
   * with the full session user — the server, not the client, assigns
   * `userTag` — so this takes that response rather than merging the request
   * the client sent, which never carried the new tag to merge in the first
   * place. A no-op when the session is not `authenticated` — nothing to
   * replace.
   */
  applyProfile: (user: AuthUser) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
