import { useEffect, useId, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import {
  checkClaudeModels,
  getClaudeSettings,
  putClaudeKey,
  type ClaudeCheck,
  type ClaudeSettings,
} from './settingsApi'
import { ConfirmButton } from './ConfirmButton'
import { useAdminFailure } from './useAdminRequest'
import { InfoHint } from '../../design-system/primitives/InfoHint'

export function ClaudeFacts({ settings }: { settings: ClaudeSettings }) {
  const { t, locale } = useI18n()
  return (
    <dl className="adm-facts">
      <div>
        <dt>{t.adminSettings.common.currentKey}</dt>
        <dd className="mono">{settings.configured ? (settings.maskedKey ?? t.adminSettings.common.saved) : t.adminSettings.common.none}</dd>
      </div>
      {settings.updatedAt !== null && (
        <div>
          <dt>{t.adminSettings.common.savedAt}</dt>
          <dd>{adminFormat(locale).timestamp(settings.updatedAt)}</dd>
        </div>
      )}
    </dl>
  )
}

export function ClaudeCheckResult({ check }: { check: ClaudeCheck }) {
  const { t, locale } = useI18n()
  const format = adminFormat(locale)
  const reachableCount = check.models.filter((model) => model.reachable).length
  return (
    <div className="adm-check">
      <p className="section__note section__note--block">
        {!check.keyConfigured
          ? t.adminSettings.claude.noKey
          : check.models.length === 0
            ? t.adminSettings.claude.noModels
            : t.adminSettings.claude.checkSummary(format.count(check.models.length), format.count(reachableCount))}
        {check.checkedAt !== null && t.adminSettings.common.checkedAt(format.timestamp(check.checkedAt))}
      </p>
      {check.models.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <caption className="adm-visually-hidden">{t.adminSettings.claude.checkCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.adminSettings.common.model}</th>
                <th scope="col">{t.adminSettings.common.access}</th>
              </tr>
            </thead>
            <tbody>
              {check.models.map((model) => (
                <tr key={model.id}>
                  <td className="mono">{model.id}</td>
                  <td>
                    <span className="status">
                      <span
                        className={`status__dot ${model.reachable ? 'status__dot--completed' : 'status__dot--failed'}`}
                        aria-hidden="true"
                      />
                      {model.reachable ? t.adminSettings.common.reachable : (model.error ?? t.adminSettings.common.unreachable)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Claude API key: same save, delete and check states as the Bedrock section. */
export function ClaudeKeySection({
  onConfiguredChange,
}: {
  /** Reports whether a key is stored, after the first load and after every save or delete. */
  onConfiguredChange: (configured: boolean) => void
}) {
  const { t, locale } = useI18n()
  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<ClaudeCheck | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const { error, setError, fail } = useAdminFailure()
  const keyFieldId = useId()

  useEffect(() => {
    const controller = new AbortController()
    getClaudeSettings(controller.signal)
      .then((loaded) => {
        setSettings(loaded)
        setCheck(loaded.lastCheck)
        onConfiguredChange(loaded.configured)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [fail, onConfiguredChange])

  async function save(apiKey: string | null) {
    setSaving(true)
    setError(null)
    try {
      const saved = await putClaudeKey(apiKey)
      setSettings(saved)
      setCheck(saved.lastCheck)
      onConfiguredChange(saved.configured)
      setAnnouncement(apiKey === null ? t.adminSettings.claude.deleted : t.adminSettings.claude.saved)
    } catch (cause) {
      fail(cause)
    } finally {
      setSaving(false)
    }
  }

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const apiKey = keyInput.trim()
    if (apiKey === '' || saving) return
    try {
      await save(apiKey)
    } finally {
      // The plain key leaves memory whether or not the save worked.
      setKeyInput('')
    }
  }

  async function runCheck() {
    setChecking(true)
    setError(null)
    try {
      const result = await checkClaudeModels()
      setCheck(result)
      setSettings((current) => (current === null ? current : { ...current, lastCheck: result }))
      setAnnouncement(t.adminSettings.claude.checked(adminFormat(locale).count(result.models.length)))
    } catch (cause) {
      fail(cause)
    } finally {
      setChecking(false)
    }
  }

  const hasKey = settings !== null && settings.configured

  return (
    <section aria-labelledby="adm-claude-title">
      <div className="section__head">
        <h2 className="section__title" id="adm-claude-title">
          {t.adminSettings.claude.title}
          <InfoHint>{t.adminSettings.claude.hint}</InfoHint>
        </h2>
      </div>

      {error !== null && (
        <p className="notice notice--critical" role="alert">
          {error}
        </p>
      )}

      {settings === null ? (
        <p className="notice">{loading ? t.adminSettings.common.loading : t.adminSettings.common.failed}</p>
      ) : (
        <ClaudeFacts settings={settings} />
      )}

      <form className="adm-form" onSubmit={saveKey}>
        <span className="adm-field adm-field--wide">
          <label className="field__label" htmlFor={keyFieldId}>
            {t.adminSettings.common.newKey}
            <InfoHint>{t.adminSettings.claude.keyHint}</InfoHint>
          </label>
          <input
            id={keyFieldId}
            className="control adm-input mono"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
          />
        </span>
        <button type="submit" className="control control--action" disabled={saving || keyInput.trim() === ''}>
          {saving ? t.adminSettings.common.saving : t.adminSettings.common.saveKey}
        </button>
        {hasKey && (
          <ConfirmButton
            label={t.adminSettings.common.deleteKey}
            confirmLabel={t.adminSettings.common.delete}
            disabled={saving}
            onConfirm={() => void save(null)}
          />
        )}
      </form>

      <div className="adm-actions">
        <button
          type="button"
          className="control control--action"
          disabled={checking || !hasKey}
          onClick={() => void runCheck()}
        >
          {checking ? t.adminSettings.common.checking : t.adminSettings.claude.checkButton}
        </button>
        {!hasKey && settings !== null && <span className="section__note">{t.adminSettings.common.setKeyFirst}</span>}
      </div>
      {check !== null && <ClaudeCheckResult check={check} />}

      <p className="adm-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
