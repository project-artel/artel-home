import type { ReactNode } from 'react'
import { NotFoundPage } from '../NotFoundPage'
import { useAuth } from '../auth/useAuth'

/**
 * Renders its children only for an `ADMIN`. Everyone else gets the ordinary
 * not-found page rather than a redirect, so the address does not advertise
 * that something lives there.
 *
 * This decides what the console shows, not who may read the data: `/api/admin`
 * already answers anyone else with 403, and the dashboard APIs stay open to
 * the roles the server allows.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.status !== 'authenticated' || auth.user.platformRole !== 'ADMIN') {
    return <NotFoundPage />
  }
  return <>{children}</>
}
