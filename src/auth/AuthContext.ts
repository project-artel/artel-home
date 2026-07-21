import { createContext } from 'react'
import type { AuthState } from './authTypes'

export type AuthContextValue = AuthState & {
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
