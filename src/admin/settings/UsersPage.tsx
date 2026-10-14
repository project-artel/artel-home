import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import {
  PLATFORM_ROLES,
  createAdminUser,
  listAdminUsers,
  parseRole,
  resetAdminUserPassword,
  updateAdminUser,
  type AdminUser,
  type PlatformRole,
} from './settingsApi'
import { ConfirmButton } from './ConfirmButton'
import { TemporaryPasswordNotice } from './TemporaryPasswordNotice'
import { useAdminFailure } from './useAdminRequest'
import './admin.css'

interface IssuedPassword {
  heading: string
  password: string
}

/**
 * 사용자 목록과 계정 관리. `ADMIN`만 이 화면에 들어오고, 서버도 같은 조건으로 거절한다 — 화면의
 * 게이트는 보여 주는 것을 고를 뿐 인가가 아니다.
 *
 * 자기 자신의 행은 등급 변경과 비활성화를 막는다. 마지막 관리자가 스스로를 내리면 이 화면에
 * 다시 들어올 방법이 없다.
 */
export default function UsersPage() {
  const { t, locale } = useI18n()
  const { user: currentUser } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedPassword | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { error, setError, fail } = useAdminFailure()

  useEffect(() => {
    const controller = new AbortController()
    listAdminUsers(controller.signal)
      .then((list) => {
        setUsers(list)
        setError(null)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reloadToken, fail, setError])

  // `loading` belongs to the event that causes the reload, not to the effect.
  const reload = useCallback(() => {
    setLoading(true)
    setReloadToken((token) => token + 1)
  }, [])

  async function runForUser(userId: string, action: () => Promise<unknown>) {
    setBusyUserId(userId)
    setError(null)
    try {
      await action()
      reload()
    } catch (cause) {
      fail(cause)
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="topbar__spacer" />
        <button type="button" className="control control--action" disabled={loading} onClick={reload}>
          {loading ? t.adminSettings.users.loading : t.adminSettings.users.refresh}
        </button>
      </header>

      <main className="main">
        {issued !== null && (
          <TemporaryPasswordNotice
            heading={issued.heading}
            password={issued.password}
            onDismiss={() => setIssued(null)}
          />
        )}

        <CreateUserForm
          onCreated={(heading, password) => {
            setIssued({ heading, password })
            reload()
          }}
        />

        {error !== null && (
          <p className="notice notice--critical" role="alert">
            {error}
          </p>
        )}

        <section aria-labelledby="adm-users-title">
          <div className="section__head">
            <h2 className="section__title" id="adm-users-title">
              {t.adminSettings.users.title}
            </h2>
            <span className="section__note">{users === null ? '' : t.adminSettings.users.count(adminFormat(locale).count(users.length))}</span>
          </div>

          {users === null ? (
            <p className="notice">{loading ? t.adminSettings.users.listLoading : t.adminSettings.users.listFailed}</p>
          ) : users.length === 0 ? (
            <p className="notice">{t.adminSettings.users.empty}</p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="adm-visually-hidden">{t.adminSettings.users.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.adminSettings.users.email}</th>
                    <th scope="col">{t.adminSettings.users.name}</th>
                    <th scope="col">{t.adminSettings.users.role}</th>
                    <th scope="col">{t.adminSettings.users.status}</th>
                    <th scope="col">{t.adminSettings.users.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelf = user.id === currentUserId
                    const label = accountLabel(user, t.adminSettings.users.github)
                    const busy = busyUserId === user.id
                    return (
                      <tr key={user.id}>
                        <td className="mono">{label}</td>
                        <td>
                          {user.displayName}
                          {isSelf && <span className="muted">{t.adminSettings.users.self}</span>}
                        </td>
                        <td>
                          <select
                            className="control"
                            aria-label={t.adminSettings.users.roleLabel(label)}
                            value={user.platformRole}
                            disabled={isSelf || busy}
                            onChange={(event) =>
                              runForUser(user.id, () =>
                                updateAdminUser(user.id, { platformRole: parseRole(event.target.value) }),
                              )
                            }
                          >
                            {PLATFORM_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {t.adminSettings.users.roles[role]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <UserStatus user={user} />
                        </td>
                        <td>
                          <span className="adm-actions">
                            <ConfirmButton
                              label={t.adminSettings.users.resetPassword}
                              confirmLabel={t.adminSettings.users.reset}
                              disabled={busy}
                              onConfirm={() =>
                                runForUser(user.id, async () => {
                                  const result = await resetAdminUserPassword(user.id)
                                  setIssued({ heading: label, password: result.temporaryPassword })
                                })
                              }
                            />
                            {user.disabled ? (
                              <button
                                type="button"
                                className="control"
                                disabled={busy}
                                onClick={() => runForUser(user.id, () => updateAdminUser(user.id, { disabled: false }))}
                              >
                                {t.adminSettings.users.enable}
                              </button>
                            ) : (
                              <ConfirmButton
                                label={t.adminSettings.users.disable}
                                confirmLabel={t.adminSettings.users.disable}
                                disabled={isSelf || busy}
                                onConfirm={() => runForUser(user.id, () => updateAdminUser(user.id, { disabled: true }))}
                              />
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <span className="section__note section__note--block" aria-live="polite">
            {busyUserId !== null ? t.adminSettings.users.saving : ''}
          </span>
        </section>
      </main>
    </div>
  )
}

/** The address a person is known by here: the sign-in email, else the contact email, else GitHub. */
function accountLabel(user: AdminUser, github: (name: string) => string): string {
  return user.loginEmail ?? user.email ?? (user.oauthProviders.length > 0 ? github(user.displayName) : user.id)
}

/** Text and a dot together, so status never depends on color alone. */
function UserStatus({ user }: { user: AdminUser }) {
  const { t } = useI18n()
  if (user.disabled) {
    return (
      <span className="status">
        <span className="status__dot status__dot--failed" aria-hidden="true" />
        {t.adminSettings.users.disabled}
      </span>
    )
  }
  if (user.mustChangePassword) {
    return (
      <span className="status">
        <span className="status__dot status__dot--active" aria-hidden="true" />
        {t.adminSettings.users.passwordChangePending}
      </span>
    )
  }
  return (
    <span className="status">
      <span className="status__dot status__dot--completed" aria-hidden="true" />
      {t.adminSettings.users.active}
    </span>
  )
}

function CreateUserForm({ onCreated }: { onCreated: (heading: string, password: string) => void }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<PlatformRole>('USER')
  const [submitting, setSubmitting] = useState(false)
  const { error, setError, fail } = useAdminFailure()
  const emailId = useId()
  const nameId = useId()
  const roleId = useId()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await createAdminUser({ email: email.trim(), name: name.trim(), platformRole: role })
      onCreated(email.trim(), result.temporaryPassword)
      setEmail('')
      setName('')
      setRole('USER')
    } catch (cause) {
      fail(cause)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="adm-create-title">
      <div className="section__head">
        <h2 className="section__title" id="adm-create-title">
          {t.adminSettings.users.create}
        </h2>
        <span className="section__note">{t.adminSettings.users.passwordOnce}</span>
      </div>
      <form className="adm-form" onSubmit={submit}>
        <span className="adm-field">
          <label className="field__label" htmlFor={emailId}>
            {t.adminSettings.users.email}
          </label>
          <input
            id={emailId}
            className="control adm-input"
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </span>
        <span className="adm-field">
          <label className="field__label" htmlFor={nameId}>
            {t.adminSettings.users.name}
          </label>
          <input
            id={nameId}
            className="control adm-input"
            type="text"
            autoComplete="off"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </span>
        <span className="adm-field">
          <label className="field__label" htmlFor={roleId}>
            {t.adminSettings.users.role}
          </label>
          <select
            id={roleId}
            className="control adm-input"
            value={role}
            onChange={(event) => setRole(parseRole(event.target.value))}
          >
            {PLATFORM_ROLES.map((value) => (
              <option key={value} value={value}>
                {t.adminSettings.users.roles[value]}
              </option>
            ))}
          </select>
        </span>
        <button
          type="submit"
          className="control control--action"
          disabled={submitting || email.trim() === '' || name.trim() === ''}
        >
          {submitting ? t.adminSettings.users.creating : t.adminSettings.users.create}
        </button>
      </form>
      {error !== null && (
        <p className="notice notice--critical" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
