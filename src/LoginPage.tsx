import { useEffect, useState } from 'react'
import { getOAuthLoginUrl } from './auth/authApi'
import { oauthProviders } from './auth/oauthProviders'

function readOAuthError(): boolean {
  return new URLSearchParams(window.location.search).has('error')
}

function ProviderIcon({ providerId }: { providerId: string }) {
  if (providerId === 'github') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.3-5.28-1.29-5.28-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.21c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
      </svg>
    )
  }

  return <span className="provider-fallback-icon" aria-hidden="true">{providerId.slice(0, 1).toUpperCase()}</span>
}

export function LoginPage({ serviceUnavailable = false }: { serviceUnavailable?: boolean }) {
  const [oauthError] = useState(readOAuthError)

  useEffect(() => {
    if (!oauthError) return
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    window.history.replaceState(null, '', url)
  }, [oauthError])

  return (
    <main className="login-layout">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand" aria-hidden="true">A</div>
        <p className="eyebrow">ARTEL Replay Studio</p>
        <h1 id="login-title">Sign in to your workspace</h1>
        <p className="login-copy">
          Continue with an approved account to inspect QA sessions, agent actions,
          and replay evidence.
        </p>

        {oauthError && (
          <div className="login-error" role="alert">
            <span aria-hidden="true">!</span>
            GitHub sign-in could not be completed. Please try again.
          </div>
        )}

        {serviceUnavailable && (
          <div className="login-error" role="alert">
            <span aria-hidden="true">!</span>
            Authentication service is unavailable. You can retry sign-in shortly.
          </div>
        )}

        <div className="provider-list" aria-label="Social sign-in providers">
          {oauthProviders.map((provider) => (
            <a
              className="provider-button"
              href={getOAuthLoginUrl(provider.loginPath)}
              key={provider.id}
            >
              <ProviderIcon providerId={provider.id} />
              Continue with {provider.label}
            </a>
          ))}
        </div>

        <p className="login-note">Authentication is handled by the selected provider.</p>
      </section>
    </main>
  )
}
