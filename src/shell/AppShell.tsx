import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

/**
 * The signed-in chrome: brand, connection state, and the user menu. Everything
 * behind the login boundary renders inside this shell's outlet.
 */
export function AppShell() {
  const auth = useAuth()

  if (auth.status !== 'authenticated') {
    // AuthProvider only ever mounts this subtree for an authenticated user; the
    // guard exists so the type narrows, not because this state is reachable.
    return null
  }

  // The server sorts identities with the most recently used provider first, so
  // the first entry is what the shell should represent the signed-in user with.
  const primaryIdentity = auth.user.identities[0] ?? null

  return (
    <div className="app-shell">
      <header className="top-bar">
        <Link className="brand" to="/projects" aria-label="ARTEL Replay Studio home">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>ARTEL</span>
          <span className="product-name">Replay Studio</span>
        </Link>
        <div className="top-bar-actions">
          <div className="connection-status" role="status">
            <span className="status-dot" aria-hidden="true" />
            Offline
          </div>
          <div className="user-menu">
            {primaryIdentity?.avatarUrl ? (
              <img className="user-avatar" src={primaryIdentity.avatarUrl} alt="" />
            ) : (
              <span className="user-avatar user-avatar--fallback" aria-hidden="true">
                {auth.user.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="user-name">{auth.user.displayName}</span>
            <button className="logout-button" type="button" onClick={() => void auth.logout()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="workspace">
        <Outlet />
      </main>
    </div>
  )
}
