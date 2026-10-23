import { useId, type FormEvent, type ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import { InfoHint } from '../../design-system/primitives/InfoHint'
import { ConfirmButton } from './ConfirmButton'

export type KeyStatus = 'loading' | 'failed' | 'configured' | 'missing'

export interface KeyFact {
  label: string
  value: string
  mono?: boolean
}

export interface KeyCheckAction {
  label: string
  busy: boolean
  /** 키가 없으면 버튼을 끄고 그 이유를 옆에 적는다. */
  hasKey: boolean
  onRun: () => void
}

/**
 * provider 키 하나의 카드. 네 provider 가 같은 자리에 같은 것을 둔다 — 머리에 이름과 상태,
 * 그 아래 저장된 키의 사실, 새 키 입력과 저장, 맨 아래에 모델 확인과 삭제.
 */
export function ProviderKeyCard({
  titleId,
  title,
  hint,
  status,
  facts,
  notices,
  error,
  keyHint,
  keyValue,
  onKeyChange,
  onSubmit,
  saving,
  saveBlocked = false,
  canDelete,
  onDelete,
  check,
  checkResult,
  announcement,
}: {
  titleId: string
  title: string
  hint: string
  status: KeyStatus
  facts: KeyFact[]
  /** 저장을 막는 서버 상태처럼 카드 안에 늘 보여야 하는 경고. */
  notices?: ReactNode
  error: string | null
  keyHint: string
  keyValue: string
  onKeyChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  saving: boolean
  /** 서버가 키를 저장할 수 없는 상태라 저장 버튼을 끈다. */
  saveBlocked?: boolean
  canDelete: boolean
  onDelete: () => void
  /** TypeSafe 처럼 확인할 모델이 없는 키는 `null`. */
  check: KeyCheckAction | null
  checkResult?: ReactNode
  announcement: string
}) {
  const { t } = useI18n()
  const keyFieldId = useId()
  const missingNoteId = useId()
  const showMissingNote = check !== null && !check.hasKey && status !== 'loading'

  return (
    <section className="adm-key" aria-labelledby={titleId}>
      <header className="adm-key__head">
        <h3 className="adm-key__title" id={titleId}>
          {title}
          <InfoHint>{hint}</InfoHint>
        </h3>
        <KeyStatusChip status={status} />
      </header>

      {facts.length > 0 && (
        <dl className="adm-key__facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd className={fact.mono === true ? 'mono' : undefined}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {notices}
      {error !== null && (
        <p className="notice notice--critical adm-key__notice" role="alert">
          {error}
        </p>
      )}

      <form className="adm-key__form" onSubmit={onSubmit}>
        <label className="field__label" htmlFor={keyFieldId}>
          {t.adminSettings.common.newKey}
          <InfoHint>{keyHint}</InfoHint>
        </label>
        <div className="adm-key__input-row">
          {/* `new-password` 로 두면 브라우저가 키를 자동으로 채우거나 저장하자고 묻지 않는다. */}
          <input
            id={keyFieldId}
            className="control adm-input mono"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={keyValue}
            onChange={(event) => onKeyChange(event.target.value)}
          />
          <button
            type="submit"
            className="control control--action"
            disabled={saving || saveBlocked || keyValue.trim() === ''}
          >
            {saving ? t.adminSettings.common.saving : t.adminSettings.common.saveKey}
          </button>
        </div>
      </form>

      {(check !== null || canDelete) && (
        <div className="adm-key__footer">
          {check !== null && (
            <button
              type="button"
              className="control"
              disabled={check.busy || !check.hasKey}
              aria-describedby={showMissingNote ? missingNoteId : undefined}
              onClick={check.onRun}
            >
              {check.busy ? t.adminSettings.common.checking : check.label}
            </button>
          )}
          {showMissingNote && (
            <span className="section__note" id={missingNoteId}>
              {t.adminSettings.common.setKeyFirst}
            </span>
          )}
          <span className="adm-key__spacer" />
          {canDelete && (
            <ConfirmButton
              label={t.adminSettings.common.deleteKey}
              confirmLabel={t.adminSettings.common.delete}
              disabled={saving}
              onConfirm={onDelete}
            />
          )}
        </div>
      )}

      {checkResult}

      <p className="adm-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}

function KeyStatusChip({ status }: { status: KeyStatus }) {
  const { t } = useI18n()
  const label = {
    loading: t.adminSettings.common.loadingShort,
    failed: t.adminSettings.common.unknown,
    configured: t.adminSettings.common.configured,
    missing: t.adminSettings.common.notConfigured,
  }[status]
  return (
    <span className={`adm-chip adm-chip--${status}`}>
      <span className="adm-chip__dot" aria-hidden="true" />
      {label}
    </span>
  )
}

export interface AccessRow {
  id: string
  reachable: boolean
  /** 접근 칸에 쓸 글. 비우면 접근 가능 여부를 쓴다. */
  detail?: string | null
}

/** 모델 확인 결과. 요약 한 줄은 늘 보이고, 모델별 표는 펼쳐야 보인다. */
export function KeyCheckResult({
  summary,
  checkedAt,
  caption,
  rows,
}: {
  summary: string
  checkedAt: string | null
  caption: string
  rows: AccessRow[]
}) {
  const { t, locale } = useI18n()
  const format = adminFormat(locale)
  const line = (
    <>
      {summary}
      {checkedAt !== null && (
        <span className="muted">{t.adminSettings.common.checkedAt(format.timestamp(checkedAt))}</span>
      )}
    </>
  )
  if (rows.length === 0) return <p className="adm-check__summary">{line}</p>
  return (
    <details className="adm-check">
      <summary className="adm-check__summary">{line}</summary>
      <div className="table-scroll">
        <table className="table">
          <caption className="adm-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{t.adminSettings.common.model}</th>
              <th scope="col">{t.adminSettings.common.access}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.id}</td>
                <td>
                  <span className="status">
                    <span
                      className={`status__dot ${row.reachable ? 'status__dot--completed' : 'status__dot--failed'}`}
                      aria-hidden="true"
                    />
                    {row.detail ?? (row.reachable ? t.adminSettings.common.reachable : t.adminSettings.common.unreachable)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
