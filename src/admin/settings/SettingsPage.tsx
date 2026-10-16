import { useEffect, useId, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import {
  checkLlmModels,
  getLlmSettings,
  putLlmKey,
  type LlmKeyCheck,
  type LlmSettings,
} from './settingsApi'
import { ConfirmButton } from './ConfirmButton'
import { BedrockKeySection } from './BedrockKeySection'
import { CacheInvalidationSection } from './CacheInvalidationSection'
import { LlmModelsSection } from './LlmModelsSection'
import { TypesafeKeySection } from './TypesafeKeySection'
import { FeatureModelsSection } from './FeatureModelsSection'
import { useAdminFailure } from './useAdminRequest'
import './admin.css'
import { InfoHint } from '../../design-system/primitives/InfoHint'

/**
 * OpenRouter 키 설정. 서버는 저장된 키를 어떤 응답에도 싣지 않고 끝부분만 가린 값을 준다. 이
 * 화면도 입력 칸에 저장된 키를 채우지 않는다 — 칸은 항상 비어 있고, 저장하면 곧바로 비운다.
 */
export default function SettingsPage() {
  const { t, locale } = useI18n()
  const [settings, setSettings] = useState<LlmSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<LlmKeyCheck | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [typesafeConfigured, setTypesafeConfigured] = useState<boolean | null>(null)
  const { error, setError, fail } = useAdminFailure()
  const keyFieldId = useId()

  useEffect(() => {
    const controller = new AbortController()
    getLlmSettings(controller.signal)
      .then((loaded) => {
        setSettings(loaded)
        setCheck(loaded.lastCheck)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [fail])

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const apiKey = keyInput.trim()
    if (apiKey === '' || saving) return
    setSaving(true)
    setError(null)
    try {
      const saved = await putLlmKey(apiKey)
      setSettings(saved)
      setCheck(saved.lastCheck)
      setAnnouncement(t.adminSettings.settings.keySaved)
    } catch (cause) {
      fail(cause)
    } finally {
      // The plain key leaves memory whether or not the save worked.
      setKeyInput('')
      setSaving(false)
    }
  }

  async function clearKey() {
    setSaving(true)
    setError(null)
    try {
      const cleared = await putLlmKey(null)
      setSettings(cleared)
      setCheck(cleared.lastCheck)
      setAnnouncement(t.adminSettings.settings.keyDeleted)
    } catch (cause) {
      fail(cause)
    } finally {
      setSaving(false)
    }
  }

  async function runCheck() {
    setChecking(true)
    setError(null)
    try {
      const result = await checkLlmModels()
      setCheck(result)
      setAnnouncement(
        result.error !== null
          ? t.adminSettings.settings.checkErrors[result.error]
          : t.adminSettings.settings.checkSummary(
              format.count(result.requiredModels.length),
              format.count(result.reachableModels.length),
            ),
      )
      // Keep the page's own picture of the key in step with what the check saw.
      setSettings((current) => (current === null ? current : { ...current, lastCheck: result }))
    } catch (cause) {
      fail(cause)
    } finally {
      setChecking(false)
    }
  }

  const format = adminFormat(locale)
  const hasKey = settings !== null && settings.configured
  const hasStoredKey = settings !== null && settings.adminKeyStored
  const cannotSave = settings !== null && !settings.secretsKeyConfigured

  return (
    <main className="main">
        {error !== null && (
          <p className="notice notice--critical" role="alert">
            {error}
          </p>
        )}

        <section aria-labelledby="adm-key-title">
          <div className="section__head">
            <h2 className="section__title" id="adm-key-title">
              {t.adminSettings.settings.openRouterKey}
              <InfoHint>{t.adminSettings.settings.openRouterHint}</InfoHint>
            </h2>
          </div>

          {settings === null ? (
            <p className="notice">{loading ? t.adminSettings.common.loading : t.adminSettings.common.failed}</p>
          ) : (
            <>
            {cannotSave && (
              <p className="notice notice--critical" role="alert">
                <strong>! {t.adminSettings.settings.secretsMissingTitle}</strong>{' '}
                {t.adminSettings.settings.secretsMissing}
              </p>
            )}
            {settings.adminKeyUnreadable && (
              <p className="notice notice--critical" role="alert">
                <strong>! {t.adminSettings.settings.keyUnreadableTitle}</strong>{' '}
                {t.adminSettings.settings.keyUnreadable}
              </p>
            )}
            <dl className="adm-facts">
              <div>
                <dt>{t.adminSettings.common.currentKey}</dt>
                <dd className="mono">{settings.maskedKey ?? t.adminSettings.common.none}</dd>
              </div>
              <div>
                <dt>{t.adminSettings.settings.sourceLabel}</dt>
                <dd>{t.adminSettings.settings.source[settings.source]}</dd>
              </div>
              {settings.adminKeyUpdatedAt !== null && (
                <div>
                  <dt>{t.adminSettings.common.savedAt}</dt>
                  <dd>{format.timestamp(settings.adminKeyUpdatedAt)}</dd>
                </div>
              )}
            </dl>
            </>
          )}

          <form className="adm-form" onSubmit={saveKey}>
            <span className="adm-field adm-field--wide">
              <label className="field__label" htmlFor={keyFieldId}>
                {t.adminSettings.common.newKey}
                <InfoHint>{t.adminSettings.settings.keyHint}</InfoHint>
              </label>
              {/* `new-password` keeps browsers from autofilling or offering to save the key. */}
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
            <button
              type="submit"
              className="control control--action"
              disabled={saving || cannotSave || keyInput.trim() === ''}
            >
              {saving ? t.adminSettings.common.saving : t.adminSettings.common.saveKey}
            </button>
            {hasStoredKey && (
              <ConfirmButton
                label={t.adminSettings.common.deleteKey}
                confirmLabel={t.adminSettings.common.delete}
                disabled={saving}
                onConfirm={clearKey}
              />
            )}
          </form>
        </section>

        <section aria-labelledby="adm-check-title">
          <div className="section__head">
            <h2 className="section__title" id="adm-check-title">
              {t.adminSettings.settings.checkTitle}
              <InfoHint>{t.adminSettings.settings.checkHint}</InfoHint>
            </h2>
          </div>
          <button
            type="button"
            className="control control--action"
            disabled={checking || !hasKey}
            onClick={runCheck}
          >
            {checking ? t.adminSettings.common.checking : t.adminSettings.settings.checkButton}
          </button>
          {!hasKey && settings !== null && (
            <span className="section__note section__note--block">{t.adminSettings.common.setKeyFirst}</span>
          )}
          {check !== null && <CheckResult check={check} />}
        </section>

        <BedrockKeySection />

        <TypesafeKeySection onConfiguredChange={setTypesafeConfigured} />

        <CacheInvalidationSection />

        <LlmModelsSection />

        <FeatureModelsSection openRouterKeyConfigured={settings === null ? null : settings.configured}
          typesafeKeyConfigured={typesafeConfigured}
          onSaved={setAnnouncement} />

        <p className="adm-visually-hidden" aria-live="polite">
          {announcement}
        </p>
    </main>
  )
}

function CheckResult({ check }: { check: LlmKeyCheck }) {
  const { t, locale } = useI18n()
  const format = adminFormat(locale)
  const reachable = new Set(check.reachableModels)
  return (
    <div className="adm-check">
      <p className="section__note section__note--block">
        {check.error !== null
          ? t.adminSettings.settings.checkErrors[check.error]
          : t.adminSettings.settings.checkSummary(
              format.count(check.requiredModels.length),
              format.count(check.reachableModels.length),
            )}
        {check.checkedAt !== null && t.adminSettings.common.checkedAt(format.timestamp(check.checkedAt))}
      </p>
      {check.requiredModels.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <caption className="adm-visually-hidden">{t.adminSettings.settings.checkCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.adminSettings.common.model}</th>
                <th scope="col">{t.adminSettings.common.access}</th>
              </tr>
            </thead>
            <tbody>
              {check.requiredModels.map((model) => {
                const ok = reachable.has(model)
                return (
                  <tr key={model}>
                    <td className="mono">{model}</td>
                    <td>
                      <span className="status">
                        <span
                          className={`status__dot ${ok ? 'status__dot--completed' : 'status__dot--failed'}`}
                          aria-hidden="true"
                        />
                        {check.error !== null
                          ? t.adminSettings.common.unchecked
                          : ok
                            ? t.adminSettings.common.reachable
                            : t.adminSettings.common.unreachable}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
