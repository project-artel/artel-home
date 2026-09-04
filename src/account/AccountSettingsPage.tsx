import { useId, useState } from 'react'
import { AuthApiError, registerEmail, updateMyProfile, verifyEmail } from '../auth/authApi'
import {
  EMAIL_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  composeNicknameTag,
  isEmailValid,
  toAccountProfileDraft,
  type AccountProfileDraft,
  type AuthUser,
} from '../auth/authTypes'
import { CliTokenPanel } from '../auth/CliTokenPanel'
import { useAuth } from '../auth/useAuth'
import { useI18n } from '../i18n/useI18n'

type ProfileFormDraft = {
  nickname: string
}

function toFormDraft(user: AuthUser): ProfileFormDraft {
  return { nickname: user.nickname }
}

/**
 * The signed-in user's own profile — nickname, and the `userTag` the server
 * assigned alongside it. This is not `SettingsSection`, which edits the
 * *project* the URL is scoped to; this screen edits the account itself, so it
 * sits outside the project workspace at its own route.
 *
 * `ARTEL-733` adds `EmailPanel` as a sibling of `ProfilePanel` in the same
 * `section-columns` list, rather than folding email into `ProfilePanel` or
 * reshaping the page. `ARTEL-781` adds `CliTokenPanel` as a third sibling for
 * the same reason — this page has no tabs or sub-routes yet, and one feature
 * is not a reason to introduce them.
 */
export function AccountSettingsPage() {
  const auth = useAuth()
  const { t } = useI18n()

  if (auth.status !== 'authenticated') {
    // The route only renders inside `AppShell`, which `AuthProvider` mounts
    // for an authenticated session only. This guard exists so the type
    // narrows below, not because this branch is reachable.
    return null
  }

  return (
    <section className="page" aria-labelledby="account-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t.account.eyebrow}</p>
          <h1 id="account-title">{t.account.title}</h1>
        </div>
      </header>

      <div className="section-columns">
        <ProfilePanel applyProfile={auth.applyProfile} user={auth.user} />
        <EmailPanel
          applyEmailVerified={auth.applyEmailVerified}
          applyPendingEmail={auth.applyPendingEmail}
          user={auth.user}
        />
        <CliTokenPanel />
      </div>
    </section>
  )
}

/**
 * Read-first, edit-on-request — the same rhythm `SettingsSection` uses, so an
 * account screen the user only visits to make one change does not default to
 * looking like unsaved work.
 */
function ProfilePanel({
  applyProfile,
  user,
}: {
  applyProfile: (user: AuthUser) => void
  user: AuthUser
}) {
  const { t } = useI18n()
  const copy = t.account.profile
  const nicknameId = useId()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileFormDraft>(() => toFormDraft(user))
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const saved = toFormDraft(user)
  const dirty = draft.nickname !== saved.nickname

  function startEditing() {
    setDraft(toFormDraft(user))
    setNicknameError(null)
    setFailure(null)
    setEditing(true)
  }

  /** Discards the draft, so nothing half-typed survives unseen. */
  function cancelEditing() {
    setNicknameError(null)
    setFailure(null)
    setEditing(false)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()

    const profile: AccountProfileDraft = toAccountProfileDraft(draft.nickname)

    // Checked before the request goes out — the server treats a blank
    // nickname as `invalid_nickname`, and a user can no longer clear it, so
    // this is the one thing left for the browser to catch early.
    if (profile.nickname.length === 0) {
      setNicknameError(copy.nicknameRequired)
      return
    }

    setNicknameError(null)
    setFailure(null)
    setSaving(true)

    try {
      const savedUser = await updateMyProfile(profile)
      applyProfile(savedUser)
      setEditing(false)
      setAnnouncement(copy.savedAnnouncement)
    } catch {
      setFailure(copy.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="profile-title">
      <header className="panel-header panel-header--split">
        <h2 id="profile-title">{copy.title}</h2>
        {!editing && (
          <button
            className="button button--secondary button--compact"
            onClick={startEditing}
            type="button"
          >
            {copy.edit}
          </button>
        )}
      </header>

      {editing ? (
        <form onSubmit={(event) => void save(event)} noValidate>
          {failure !== null && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">!</span>
              {failure}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor={nicknameId}>{copy.nicknameLabel}</label>
            <input
              aria-describedby={nicknameError !== null ? `${nicknameId}-error` : undefined}
              aria-invalid={nicknameError !== null || undefined}
              className="field-input"
              disabled={saving}
              id={nicknameId}
              maxLength={NICKNAME_MAX_LENGTH}
              onChange={(event) => setDraft({ nickname: event.target.value })}
              value={draft.nickname}
            />
            {nicknameError !== null ? (
              <p className="field-error" id={`${nicknameId}-error`}>{nicknameError}</p>
            ) : (
              <p className="field-hint">{copy.nicknameHint}</p>
            )}
            <p className="field-hint">{copy.userTagHint}</p>
          </div>

          <div className="form-actions">
            <button
              className="button button--secondary"
              disabled={saving}
              onClick={cancelEditing}
              type="button"
            >
              {copy.cancel}
            </button>
            <button className="button button--primary" disabled={!dirty || saving} type="submit">
              {saving ? copy.saving : copy.save}
            </button>
          </div>
        </form>
      ) : (
        <dl className="detail-fields">
          <dt>{copy.nicknameLabel}</dt>
          <dd>{user.nickname}</dd>

          <dt>{copy.userTagLabel}</dt>
          <dd>
            <span className="mono">{composeNicknameTag(user.nickname, user.userTag)}</span>
          </dd>
        </dl>
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}

/**
 * Email registration and verification. `ARTEL-733`'s non-goal: no email
 * actually arrives, because the server only logs the verification token —
 * this panel reads as "paste the code from the server log", not "check your
 * inbox", and says so directly in `copy.tokenHint`.
 *
 * Two independent pieces of server state drive the layout, not one edit mode
 * the way `ProfilePanel` has: `user.email`/`user.emailVerified` describe the
 * address that currently receives invitations (or the lack of one), and
 * `user.pendingEmail` describes a registration still waiting on its token.
 * Both can be true at once — registering a new address while a previous one
 * is already verified leaves the old address active until the new one is
 * confirmed — so the verified/unset row and the pending-verification block
 * render independently rather than as branches of one state.
 */
function EmailPanel({
  applyEmailVerified,
  applyPendingEmail,
  user,
}: {
  applyEmailVerified: () => void
  applyPendingEmail: (pendingEmail: string) => void
  user: AuthUser
}) {
  const { t } = useI18n()
  const copy = t.account.email
  const emailId = useId()
  const tokenId = useId()

  const verified = user.email !== null && user.emailVerified
  const pending = user.pendingEmail !== null

  const [editingEmail, setEditingEmail] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [registerFailure, setRegisterFailure] = useState<string | null>(null)

  const [tokenDraft, setTokenDraft] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyFailure, setVerifyFailure] = useState<string | null>(null)

  const [announcement, setAnnouncement] = useState('')

  function startEditing() {
    setEmailDraft('')
    setEmailError(null)
    setRegisterFailure(null)
    setEditingEmail(true)
  }

  /** Discards the draft, so nothing half-typed survives unseen. */
  function cancelEditing() {
    setEmailError(null)
    setRegisterFailure(null)
    setEditingEmail(false)
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault()

    // 소문자로 맞춰 보낸다. 서버가 `email_verification.email` 에 소문자로 저장하므로, 적은
    // 그대로 보내면 화면이 들고 있는 대기 주소와 서버가 아는 주소의 대소문자가 갈린다 — 다음
    // `/api/auth/me` 가 올 때까지 화면이 서버와 다른 문자열을 보여 준다.
    const candidate = emailDraft.trim().toLowerCase()

    // Checked before the request goes out, the same rhythm `ProfilePanel`
    // uses for a blank nickname: an obviously malformed address never
    // reaches the server.
    if (!isEmailValid(candidate)) {
      setEmailError(copy.emailInvalid)
      return
    }

    setEmailError(null)
    setRegisterFailure(null)
    setRegistering(true)

    try {
      await registerEmail(candidate)
      // The response is `202`; the address just accepted is the one already
      // in hand, so `AuthProvider` is updated from it directly.
      applyPendingEmail(candidate)
      setEditingEmail(false)
      // A fresh registration replaces whatever verification attempt was
      // already in flight, so its leftover token draft and failure text do
      // not carry over to the new address.
      setTokenDraft('')
      setVerifyFailure(null)
      setAnnouncement(copy.registeredAnnouncement(candidate))
    } catch (error) {
      setRegisterFailure(
        error instanceof AuthApiError && error.status === 409
          ? copy.emailConflict
          : copy.registerFailed,
      )
    } finally {
      setRegistering(false)
    }
  }

  async function submitToken(event: React.FormEvent) {
    event.preventDefault()

    setVerifyFailure(null)
    setVerifying(true)

    try {
      await verifyEmail(tokenDraft.trim())
      applyEmailVerified()
      setTokenDraft('')
      setAnnouncement(copy.verifiedAnnouncement)
    } catch (error) {
      setVerifyFailure(
        error instanceof AuthApiError && error.status === 400
          ? copy.tokenInvalid
          : copy.verifyFailed,
      )
    } finally {
      setVerifying(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="email-title">
      <header className="panel-header panel-header--split">
        <h2 id="email-title">{copy.title}</h2>
        {!editingEmail && (
          <button
            className="button button--secondary button--compact"
            onClick={startEditing}
            type="button"
          >
            {verified || pending ? copy.change : copy.add}
          </button>
        )}
      </header>

      {editingEmail ? (
        <form onSubmit={(event) => void submitEmail(event)} noValidate>
          {registerFailure !== null && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">!</span>
              {registerFailure}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor={emailId}>{copy.emailLabel}</label>
            <input
              aria-describedby={emailError !== null ? `${emailId}-error` : undefined}
              aria-invalid={emailError !== null || undefined}
              autoComplete="email"
              className="field-input"
              disabled={registering}
              id={emailId}
              maxLength={EMAIL_MAX_LENGTH}
              onChange={(event) => setEmailDraft(event.target.value)}
              placeholder={copy.emailPlaceholder}
              type="email"
              value={emailDraft}
            />
            {emailError !== null ? (
              <p className="field-error" id={`${emailId}-error`}>{emailError}</p>
            ) : (
              <p className="field-hint">{copy.emailHint}</p>
            )}
          </div>

          <div className="form-actions">
            <button
              className="button button--secondary"
              disabled={registering}
              onClick={cancelEditing}
              type="button"
            >
              {copy.cancel}
            </button>
            <button
              className="button button--primary"
              disabled={emailDraft.trim().length === 0 || registering}
              type="submit"
            >
              {registering ? copy.registering : copy.register}
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="detail-fields">
            <dt>{copy.emailLabel}</dt>
            <dd>
              {verified ? (
                <>
                  <span className="mono">{user.email}</span>{' '}
                  <span className="badge badge--success">{copy.verifiedBadge}</span>
                </>
              ) : (
                <span className="detail-empty">{copy.notSet}</span>
              )}
            </dd>
          </dl>

          {/* Verified and unverified must read as visually distinct states,
              not just differently worded ones — this is the only place the
              screen says outright that invitations cannot reach the account
              yet. Shown whenever there is no verified address, regardless of
              whether a registration is pending: a pending address does not
              receive invitations either. */}
          {!verified && (
            <div className="inline-notice" role="status">
              <span aria-hidden="true">!</span>
              {copy.cannotInviteYet}
            </div>
          )}
        </>
      )}

      {pending && (
        <>
          <dl className="detail-fields">
            <dt>{copy.pendingBadge}</dt>
            <dd>
              <span className="mono">{user.pendingEmail}</span>{' '}
              <span className="badge badge--warning">{copy.pendingBadge}</span>
            </dd>
          </dl>
          <p className="field-hint">{copy.pendingNotice(user.pendingEmail ?? '')}</p>

          <form onSubmit={(event) => void submitToken(event)} noValidate>
            {verifyFailure !== null && (
              <div className="inline-error" role="alert">
                <span aria-hidden="true">!</span>
                {verifyFailure}
              </div>
            )}

            <div className="field">
              <label className="field-label" htmlFor={tokenId}>{copy.tokenLabel}</label>
              <input
                className="field-input mono"
                disabled={verifying}
                id={tokenId}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder={copy.tokenPlaceholder}
                value={tokenDraft}
              />
              <p className="field-hint">{copy.tokenHint}</p>
            </div>

            <div className="form-actions">
              <button
                className="button button--primary"
                disabled={tokenDraft.trim().length === 0 || verifying}
                type="submit"
              >
                {verifying ? copy.verifying : copy.verify}
              </button>
            </div>
          </form>
        </>
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}
