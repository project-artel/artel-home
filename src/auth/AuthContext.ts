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
  /**
   * Merges a just-accepted email registration into the current user, right
   * after `registerEmail` resolves with `202`. Local merge, the same reason
   * `applyProfile` is: the caller already knows the exact address the server
   * just accepted. A no-op when the session is not `authenticated`.
   */
  applyPendingEmail: (pendingEmail: string) => void
  /**
   * Promotes `pendingEmail` to `email` right after `verifyEmail` resolves
   * with `204`. A no-op when the session is not `authenticated` or there is
   * no pending address to promote — the second case should not happen if the
   * screen only ever renders the verify form while one exists, but the guard
   * keeps this function safe to call regardless.
   */
  applyEmailVerified: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
