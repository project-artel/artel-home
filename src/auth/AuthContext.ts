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
}

export const AuthContext = createContext<AuthContextValue | null>(null)
