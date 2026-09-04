import { useId, useState } from 'react'
import { CopyButton } from '../projects/CopyButton'
import { formatDateTime } from '../projects/formatters'
import { useI18n } from '../i18n/useI18n'
import { createCliToken } from './cliTokenApi'
import {
  CLI_TOKEN_EXPIRY_OPTIONS,
  DEFAULT_CLI_TOKEN_EXPIRY,
  isCliTokenExpired,
  isCliTokenRevoked,
  toExpiresInDays,
  type CliToken,
  type CliTokenCreated,
  type CliTokenExpiryDraft,
} from './cliTokenTypes'
import { RevokeCliTokenDialog } from './RevokeCliTokenDialog'
import { useCliTokens } from './useCliTokens'

/**
 * `artel-cli` 인증에 쓰는 토큰을 발급·조회·폐기한다. `ProfilePanel`/`EmailPanel` 의 "읽기 →
 * 편집 요청" 리듬이 아니라 `MembersSection` 의 `InvitePanel` 리듬을 따른다 — 발급 폼을 항상
 * 열어 두고, 방금 만든 토큰의 원문을 그 바로 아래에서 보여 준 다음, 그 아래에 목록을 그린다.
 *
 * 원문은 이 컴포넌트의 local state 에만 있다. `AuthProvider`, `AuthContext`, sessionStorage,
 * localStorage 어디에도 올리지 않는다 — `/account` 를 벗어나면 React Router 가 이 컴포넌트를
 * unmount 하고, 돌아왔을 때는 이 state 가 `useState` 초기값인 `null` 로 되돌아간 새 컴포넌트다.
 */
export function CliTokenPanel() {
  const { t } = useI18n()
  const copy = t.account.cliTokens
  const { status, tokens, reload, refresh, applyCreated } = useCliTokens()

  const [nameDraft, setNameDraft] = useState('')
  const [expiryDraft, setExpiryDraft] = useState<CliTokenExpiryDraft>(DEFAULT_CLI_TOKEN_EXPIRY)
  const [nameError, setNameError] = useState<string | null>(null)
  const [createFailure, setCreateFailure] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [createdToken, setCreatedToken] = useState<CliTokenCreated | null>(null)
  const [revoking, setRevoking] = useState<CliToken | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const nameId = useId()
  const expiryId = useId()

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const name = nameDraft.trim()

    // 서버가 이름 길이를 어디서 자르는지는 계약에 없다 — 빈 이름만 여기서 막고, 길이는 서버
    // 400 에 맡긴다.
    if (name.length === 0) {
      setNameError(copy.nameRequired)
      return
    }

    setNameError(null)
    setCreateFailure(null)
    setCreating(true)

    try {
      const created = await createCliToken(name, toExpiresInDays(expiryDraft))
      applyCreated(created)
      setCreatedToken(created)
      setNameDraft('')
      setExpiryDraft(DEFAULT_CLI_TOKEN_EXPIRY)
      setAnnouncement(copy.createdAnnouncement(created.name))
    } catch {
      setCreateFailure(copy.createFailed)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="cli-tokens-title">
      <header className="panel-header">
        <h2 id="cli-tokens-title">{copy.title}</h2>
      </header>
      <p className="section-intro">{copy.intro}</p>

      <form onSubmit={(event) => void submit(event)} noValidate>
        {createFailure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {createFailure}
          </div>
        )}

        <div className="invite-form-fields">
          <div className="field">
            <label className="field-label" htmlFor={nameId}>{copy.nameLabel}</label>
            <input
              aria-describedby={nameError !== null ? `${nameId}-error` : undefined}
              aria-invalid={nameError !== null || undefined}
              className="field-input"
              disabled={creating}
              id={nameId}
              onChange={(event) => setNameDraft(event.target.value)}
              value={nameDraft}
            />
            {nameError !== null && (
              <p className="field-error" id={`${nameId}-error`}>{nameError}</p>
            )}
          </div>

          <div className="field field--compact">
            <label className="field-label" htmlFor={expiryId}>{copy.expiryLabel}</label>
            <select
              className="field-input"
              disabled={creating}
              id={expiryId}
              onChange={(event) => setExpiryDraft(event.target.value as CliTokenExpiryDraft)}
              value={expiryDraft}
            >
              {CLI_TOKEN_EXPIRY_OPTIONS.map((option) => (
                <option key={option} value={option}>{expiryOptionLabel(copy, option)}</option>
              ))}
            </select>
          </div>

          <button
            className="button button--primary"
            disabled={creating || nameDraft.trim().length === 0}
            type="submit"
          >
            {creating ? copy.creating : copy.create}
          </button>
        </div>
      </form>

      {createdToken !== null && (
        <>
          <div className="inline-notice" role="status">
            <span aria-hidden="true">!</span>
            {copy.revealWarning}
          </div>
          <div className="cli-token-value">
            <code className="mono">{createdToken.token}</code>
            <CopyButton
              copiedMessage={copy.copiedAnnouncement}
              label={copy.copy}
              onResult={setAnnouncement}
              text={createdToken.token}
            />
          </div>
          <div className="form-actions">
            <button
              className="button button--secondary button--compact"
              onClick={() => setCreatedToken(null)}
              type="button"
            >
              {copy.dismissReveal}
            </button>
          </div>
        </>
      )}

      {status === 'loading' && (
        <ul className="cli-token-list" aria-busy="true" aria-label={copy.loadingLabel}>
          {[0, 1].map((row) => (
            <li className="cli-token-row" key={row} aria-hidden="true">
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line--short" />
            </li>
          ))}
        </ul>
      )}

      {status === 'error' && (
        <div className="panel-message" role="alert">
          <p>{copy.loadFailed}</p>
          <button className="button button--secondary" onClick={reload} type="button">
            {t.projects.shared.retry}
          </button>
        </div>
      )}

      {status === 'ready' && tokens.length === 0 && (
        <p className="panel-empty">{copy.empty}</p>
      )}

      {status === 'ready' && tokens.length > 0 && (
        <ul className="cli-token-list">
          {tokens.map((token) => (
            <CliTokenRow key={token.id} onRevoke={() => setRevoking(token)} token={token} />
          ))}
        </ul>
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>

      {revoking !== null && (
        <RevokeCliTokenDialog
          onClose={() => setRevoking(null)}
          onRevoked={() => {
            const revokedName = revoking.name
            refresh()
            setRevoking(null)
            setAnnouncement(copy.revokedAnnouncement(revokedName))
          }}
          tokenId={revoking.id}
          tokenName={revoking.name}
        />
      )}
    </section>
  )
}

function expiryOptionLabel(copy: ReturnType<typeof useI18n>['t']['account']['cliTokens'], option: CliTokenExpiryDraft): string {
  switch (option) {
    case '30': return copy.expiryOption30
    case '90': return copy.expiryOption90
    case '180': return copy.expiryOption180
    case '365': return copy.expiryOption365
    case 'never': return copy.expiryNever
  }
}

/**
 * 한 줄. `revokedAt` 이 있으면 만료 여부와 무관하게 무조건 revoked 로 그린다 — 사용자가 실제로
 * 누른 동작이라 서버 시계가 정한 만료보다 더 확정적인 사실이다.
 */
function CliTokenRow({
  onRevoke,
  token,
}: {
  onRevoke: () => void
  token: CliToken
}) {
  const { t } = useI18n()
  const copy = t.account.cliTokens

  const revoked = isCliTokenRevoked(token)
  const expired = !revoked && isCliTokenExpired(token)
  const rowClassName = revoked
    ? 'cli-token-row cli-token-row--revoked'
    : expired
      ? 'cli-token-row cli-token-row--expired'
      : 'cli-token-row'

  return (
    <li className={rowClassName}>
      <div className="cli-token-row-main">
        <span className="cli-token-row-name">{token.name}</span>
        {revoked && <span className="badge badge--critical">{copy.revokedBadge}</span>}
        {!revoked && expired && <span className="badge badge--warning">{copy.expiredBadge}</span>}
      </div>

      <p className="cli-token-row-meta">
        {copy.createdLabel(formatDateTime(token.createdAt))}
        <span aria-hidden="true"> · </span>
        {token.lastUsedAt === null ? copy.neverUsed : copy.lastUsedLabel(formatDateTime(token.lastUsedAt))}
        <span aria-hidden="true"> · </span>
        {token.expiresAt === null ? copy.neverExpires : copy.expiresLabel(formatDateTime(token.expiresAt))}
      </p>

      {!revoked && (
        <div className="cli-token-row-actions">
          <button
            className="button button--danger-quiet button--compact"
            onClick={onRevoke}
            type="button"
          >
            {copy.revoke}
          </button>
        </div>
      )}
    </li>
  )
}
