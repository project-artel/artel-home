import { useEffect, useState } from 'react'
import { createSdkLoginCode } from './authApi'
import { callbackUrl, parkRequest, readRelayRequest } from './sdkLoginRequest'
import { useAuth } from './useAuth'
import { useI18n } from '../i18n/useI18n'
import { LoginPage } from '../LoginPage'
import { ThemeToggle } from '../ThemeToggle'

/**
 * The page the SDK opens in the browser to trade the user's console session for
 * a one-time code, which it then exchanges for its own token over loopback.
 *
 * It is matched ahead of the router rather than inside it: the routed subtree
 * only mounts for a signed-in user, and the SDK opens this page in whatever
 * browser the developer uses, which may have no session at all.
 */
export function SdkLoginPage() {
  const auth = useAuth()
  const { t } = useI18n()
  // Read once. A later render must not re-read the address, because the last
  // thing this page does is navigate away from it.
  const [request] = useState(() => readRelayRequest(window.location.search))
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (typeof request === 'string') return

    if (auth.status !== 'authenticated') {
      if (auth.status !== 'loading') parkRequest()
      return
    }

    // The code is single-use and expires in minutes, so it is issued here on
    // arrival rather than behind a confirm button that could sit unread.
    let cancelled = false

    createSdkLoginCode(request.challenge)
      .then((code) => {
        if (cancelled) return
        // Held so the panel keeps saying something while the browser leaves.
        setLeaving(true)
        window.location.href = callbackUrl(request, code)
      })
      .catch(() => {
        // A 401 has already flipped `auth` to unauthenticated, and that branch
        // renders first, so this only ever shows a real failure.
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [attempt, auth.status, request])

  if (typeof request === 'string') {
    return <SdkLoginPanel message={t.common.sdkLogin[request]} />
  }

  if (auth.status === 'loading') {
    return <SdkLoginProgress message={t.common.session.checking} />
  }

  if (auth.status !== 'authenticated') {
    return (
      <LoginPage
        copy={t.common.sdkLogin.signInCopy}
        serviceUnavailable={auth.status === 'error'}
      />
    )
  }

  if (failed) {
    return (
      <SdkLoginPanel
        message={t.common.sdkLogin.failed}
        onRetry={() => {
          setFailed(false)
          setAttempt((current) => current + 1)
        }}
      />
    )
  }

  return (
    <SdkLoginProgress
      message={leaving ? t.common.sdkLogin.returning : t.common.sdkLogin.issuing}
    />
  )
}

/** The same shape the session check uses, so the two waits do not look different. */
function SdkLoginProgress({ message }: { message: string }) {
  return (
    <main className="session-loading" aria-live="polite">
      <span className="loading-mark" aria-hidden="true" />
      {message}
    </main>
  )
}

/**
 * Every dead end this page can reach. `onRetry` is omitted for a broken
 * address, where retrying the same URL can only fail the same way.
 */
function SdkLoginPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n()

  return (
    <main className="login-layout">
      <div className="login-theme-toggle">
        <ThemeToggle
          toDarkLabel={t.common.shell.switchToDark}
          toLightLabel={t.common.shell.switchToLight}
        />
      </div>
      <section className="login-panel" aria-labelledby="sdk-login-title">
        <div className="login-brand" aria-hidden="true">
          <img src="/artel-mark.svg" alt="" />
        </div>
        <p className="eyebrow">{t.common.sdkLogin.eyebrow}</p>
        <h1 id="sdk-login-title">{t.common.sdkLogin.title}</h1>

        <div className="login-error" role="alert">
          <span aria-hidden="true">!</span>
          {message}
        </div>

        {onRetry !== undefined && (
          <div className="form-actions">
            <button className="button button--primary" onClick={onRetry} type="button">
              {t.common.sdkLogin.retry}
            </button>
          </div>
        )}

        <p className="login-note">{t.common.sdkLogin.note}</p>
      </section>
    </main>
  )
}
