import { useId, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { ThemeToggle } from '../ThemeToggle'
import { useAuth } from './useAuth'
import { PASSWORD_MIN_LENGTH, changePassword } from './passwordAuthApi'
import { passwordChangeErrorMessage } from './passwordFormErrors'

/**
 * Shown instead of the whole app while `/api/auth/me` reports
 * `mustChangePassword`. The server answers 403 to everything else in that
 * state, so rendering any other screen would only show a wall of errors.
 */
export function ForcePasswordChangePage() {
  const { t } = useI18n()
  const { logout, refresh } = useAuth()
  const copy = t.common.passwordChange
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentId = useId()
  const nextId = useId()
  const repeatId = useId()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (next.length < PASSWORD_MIN_LENGTH) {
      setError(copy.errorRejected)
      return
    }
    if (next !== repeat) {
      setError(copy.errorMismatch)
      return
    }
    if (next === current) {
      setError(copy.errorSame)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await changePassword(current, next)
      await refresh()
    } catch (cause) {
      setError(passwordChangeErrorMessage(cause, copy))
      setSubmitting(false)
    }
  }

  return (
    <main className="login-layout">
      <div className="login-theme-toggle">
        <ThemeToggle
          toDarkLabel={t.common.shell.switchToDark}
          toLightLabel={t.common.shell.switchToLight}
        />
      </div>
      <section className="login-panel" aria-labelledby="password-change-title">
        <p className="eyebrow">ARTEL Replay Studio</p>
        <h1 id="password-change-title">{copy.title}</h1>
        <p className="login-copy">{copy.copy}</p>

        <form className="login-form" onSubmit={submit}>
          {error !== null && (
            <div className="login-error login-error--form" role="alert">
              <span aria-hidden="true">!</span>
              {error}
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor={currentId}>{copy.currentLabel}</label>
            <input id={currentId} className="field-input" type="password" autoComplete="current-password"
              value={current} onChange={(event) => setCurrent(event.target.value)} required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={nextId}>{copy.newLabel}</label>
            <input id={nextId} className="field-input" type="password" autoComplete="new-password"
              value={next} onChange={(event) => setNext(event.target.value)} minLength={PASSWORD_MIN_LENGTH}
              aria-describedby={`${nextId}-hint`} required />
            <p className="field-hint" id={`${nextId}-hint`}>{copy.newPasswordHint}</p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={repeatId}>{copy.confirmLabel}</label>
            <input id={repeatId} className="field-input" type="password" autoComplete="new-password"
              value={repeat} onChange={(event) => setRepeat(event.target.value)} required />
          </div>
          <button
            className="button button--primary login-submit"
            type="submit"
            disabled={submitting || current === '' || next === '' || repeat === ''}
          >
            {submitting ? copy.submitting : copy.submit}
          </button>
          <button className="button button--secondary login-submit" type="button" onClick={() => void logout()}>
            {copy.signOut}
          </button>
        </form>
      </section>
    </main>
  )
}
