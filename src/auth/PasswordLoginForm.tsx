import { useId, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useAuth } from './useAuth'
import { PASSWORD_MIN_LENGTH, loginWithPassword, signUpWithPassword } from './passwordAuthApi'
import { loginErrorMessage } from './passwordFormErrors'

type Mode = 'signIn' | 'signUp'

/**
 * The email and password form. It is always shown; the sign-up mode is offered
 * only while the server says `signupOpen`. A successful call leaves new session
 * cookies behind, so the user is read again and the app leaves the login
 * boundary on its own.
 */
export function PasswordLoginForm({ signupOpen }: { signupOpen: boolean }) {
  const { t } = useI18n()
  const { refresh } = useAuth()
  const copy = t.common.login
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emailId = useId()
  const passwordId = useId()
  const nameId = useId()

  // The sign-up tab can disappear (signup closes after the first account); fall back instead of submitting to a closed endpoint.
  const activeMode: Mode = signupOpen ? mode : 'signIn'
  const canSubmit = email.trim() !== '' && password !== '' && (activeMode === 'signIn' || (name.trim() !== '' && password.length >= PASSWORD_MIN_LENGTH))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      if (activeMode === 'signIn') {
        await loginWithPassword(email.trim(), password)
      } else {
        await signUpWithPassword(email.trim(), password, name.trim())
      }
      await refresh()
    } catch (cause) {
      setError(loginErrorMessage(cause, activeMode, copy))
      setSubmitting(false)
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      {signupOpen && (
        <div className="login-mode" role="group" aria-label={copy.modeLabel}>
          <button
            type="button"
            className="login-mode-button"
            aria-pressed={activeMode === 'signIn'}
            onClick={() => { setMode('signIn'); setError(null) }}
          >
            {copy.signInTab}
          </button>
          <button
            type="button"
            className="login-mode-button"
            aria-pressed={activeMode === 'signUp'}
            onClick={() => { setMode('signUp'); setError(null) }}
          >
            {copy.signUpTab}
          </button>
        </div>
      )}

      {error !== null && (
        <div className="login-error login-error--form" role="alert">
          <span aria-hidden="true">!</span>
          {error}
        </div>
      )}

      {activeMode === 'signUp' && (
        <div className="field">
          <label className="field-label" htmlFor={nameId}>{copy.nameLabel}</label>
          <input
            id={nameId}
            className="field-input"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor={emailId}>{copy.emailLabel}</label>
        <input
          id={emailId}
          className="field-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={passwordId}>{copy.passwordLabel}</label>
        <input
          id={passwordId}
          className="field-input"
          type="password"
          autoComplete={activeMode === 'signIn' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={activeMode === 'signUp' ? PASSWORD_MIN_LENGTH : undefined}
          required
        />
        {activeMode === 'signUp' && <p className="field-hint">{copy.passwordHint}</p>}
      </div>
      {activeMode === 'signUp' && <p className="field-hint">{copy.signUpHint}</p>}

      <button className="button button--primary login-submit" type="submit" disabled={!canSubmit || submitting}>
        {submitting ? copy.submitting : activeMode === 'signIn' ? copy.signInSubmit : copy.signUpSubmit}
      </button>
    </form>
  )
}
