import { useId, useState } from 'react'
import { updateMyProfile } from '../auth/authApi'
import {
  NICKNAME_MAX_LENGTH,
  composeNicknameTag,
  toAccountProfileDraft,
  type AccountProfileDraft,
  type AuthUser,
} from '../auth/authTypes'
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
 * `ARTEL-733` adds email registration and verification to this same screen.
 * The page stays a `section-columns` list of panels, with `ProfilePanel` as
 * the first entry, so that work adds a sibling panel rather than reshaping
 * this one.
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
