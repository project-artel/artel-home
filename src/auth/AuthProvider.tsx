import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { endSession, getCurrentUser, setUnauthorizedHandler } from './authApi'
import { AuthContext, type AuthContextValue } from './AuthContext'
import type { AccountProfileDraft, AuthState } from './authTypes'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })

  const logout = useCallback(async () => {
    try {
      await endSession()
    } finally {
      setState({ status: 'unauthenticated', user: null })
    }
  }, [])

  const applyProfile = useCallback((profile: AccountProfileDraft) => {
    setState((current) =>
      current.status === 'authenticated'
        ? { status: 'authenticated', user: { ...current.user, ...profile } }
        : current,
    )
  }, [])

  useEffect(() => setUnauthorizedHandler(() => {
    setState({ status: 'unauthenticated', user: null })
  }), [])

  useEffect(() => {
    const controller = new AbortController()

    getCurrentUser(controller.signal)
      .then((user) => {
        setState(user
          ? { status: 'authenticated', user }
          : { status: 'unauthenticated', user: null })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', user: null })
      })

    return () => controller.abort()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, applyProfile, logout }),
    [applyProfile, logout, state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
