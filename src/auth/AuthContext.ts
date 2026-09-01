import { createContext } from 'react'
import type { AccountProfileDraft, AuthState } from './authTypes'

export type AuthContextValue = AuthState & {
  logout: () => Promise<void>
  /**
   * Merges a saved nickname/BattleTag into the current user, right after
   * `updateMyProfile` resolves. Local merge rather than a re-fetch of
   * `/api/auth/me`: the caller already knows the exact value the server just
   * accepted, and a second round trip for two fields would only add latency
   * an already-authenticated screen has no reason to wait on. A no-op when
   * the session is not `authenticated` — nothing to merge into.
   */
  applyProfile: (profile: AccountProfileDraft) => void
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
