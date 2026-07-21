import './App.css'
import { LoginPage } from './LoginPage'
import { useAuth } from './auth/useAuth'

const actions = [
  { label: 'Connect Unity session', variant: 'primary' },
  { label: 'Open recording', variant: 'secondary' },
  { label: 'Run test', variant: 'secondary' },
] as const

export function App() {
  const auth = useAuth()

  // The server sorts identities with the most recently used provider first, so
  // the first entry is what the shell should represent the signed-in user with.
  const primaryIdentity = auth.user?.identities[0] ?? null

  if (auth.status === 'loading') {
    return (
      <main className="session-loading" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        Checking your session…
      </main>
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'error') {
    return <LoginPage serviceUnavailable={auth.status === 'error'} />
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <a className="brand" href="/" aria-label="ARTEL Replay Studio home">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>ARTEL</span>
          <span className="product-name">Replay Studio</span>
        </a>
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
        <section className="empty-state" aria-labelledby="empty-state-title">
          <div className="empty-state-icon" aria-hidden="true">
            <span />
          </div>
          <p className="eyebrow">Replay workspace</p>
          <h1 id="empty-state-title">Start with a QA session</h1>
          <p className="empty-state-copy">
            Connect a live Unity session or open a recording to inspect agent
            actions, game state, and evidence on one synchronized timeline.
          </p>
          <div className="action-group" aria-label="Session actions">
            {actions.map((action) => (
              <button
                className={`button button--${action.variant}`}
                key={action.label}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
          <p className="shortcut-hint">
            No active session <span aria-hidden="true">·</span> Events and evidence
            will appear here
          </p>
        </section>
      </main>
    </div>
  )
}
