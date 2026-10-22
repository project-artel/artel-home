import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import { checkLlmModels, getLlmSettings, putLlmKey, type LlmKeyCheck, type LlmSettings } from './settingsApi'
import { useAdminFailure } from './useAdminRequest'
import { KeyCheckResult, ProviderKeyCard, type KeyFact, type KeyStatus } from './ProviderKeyCard'

/**
 * OpenRouter 키 설정. 서버는 저장된 키를 어떤 응답에도 싣지 않고 끝부분만 가린 값을 준다. 이
 * 화면도 입력 칸에 저장된 키를 채우지 않는다 — 칸은 항상 비어 있고, 저장하면 곧바로 비운다.
 * 모델 접근 확인도 이 카드 안에 있다.
 */
export function OpenRouterKeySection({
  onConfiguredChange,
}: {
  /** Reports whether a key is configured, after the first load and after every save or delete. */
  onConfiguredChange: (configured: boolean) => void
}) {
  const { t, locale } = useI18n()
  const [settings, setSettings] = useState<LlmSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<LlmKeyCheck | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const { error, setError, fail } = useAdminFailure()
  const format = adminFormat(locale)

  useEffect(() => {
    const controller = new AbortController()
    getLlmSettings(controller.signal)
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
      onConfiguredChange(saved.configured)
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
      onConfiguredChange(cleared.configured)
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
      setAnnouncement(checkSummary(result))
      // Keep the card's own picture of the key in step with what the check saw.
      setSettings((current) => (current === null ? current : { ...current, lastCheck: result }))
    } catch (cause) {
      fail(cause)
    } finally {
      setChecking(false)
    }
  }

  function checkSummary(result: LlmKeyCheck): string {
    return result.error !== null
      ? t.adminSettings.settings.checkErrors[result.error]
      : t.adminSettings.settings.checkSummary(
          format.count(result.requiredModels.length),
          format.count(result.reachableModels.length),
        )
  }

  const hasKey = settings !== null && settings.configured
  const hasStoredKey = settings !== null && settings.adminKeyStored
  const cannotSave = settings !== null && !settings.secretsKeyConfigured
  const status: KeyStatus = settings === null ? (loading ? 'loading' : 'failed') : hasKey ? 'configured' : 'missing'
  const facts: KeyFact[] =
    settings === null
      ? []
      : [
          ...(settings.maskedKey !== null
            ? [{ label: t.adminSettings.common.currentKey, value: settings.maskedKey, mono: true }]
            : []),
          ...(settings.adminKeyUpdatedAt !== null
            ? [{ label: t.adminSettings.common.savedAt, value: format.timestamp(settings.adminKeyUpdatedAt) }]
            : []),
        ]
  const reachable = new Set(check?.reachableModels ?? [])

  return (
    <ProviderKeyCard
      titleId="adm-key-title"
      title={t.adminSettings.settings.openRouterKey}
      hint={`${t.adminSettings.settings.openRouterHint} ${t.adminSettings.settings.checkHint}`}
      status={status}
      facts={facts}
      notices={
        settings !== null && (
          <>
            {cannotSave && (
              <p className="notice notice--critical adm-key__notice" role="alert">
                <strong>! {t.adminSettings.settings.secretsMissingTitle}</strong>{' '}
                {t.adminSettings.settings.secretsMissing}
              </p>
            )}
            {settings.adminKeyUnreadable && (
              <p className="notice notice--critical adm-key__notice" role="alert">
                <strong>! {t.adminSettings.settings.keyUnreadableTitle}</strong>{' '}
                {t.adminSettings.settings.keyUnreadable}
              </p>
            )}
          </>
        )
      }
      error={error}
      keyHint={t.adminSettings.settings.keyHint}
      keyValue={keyInput}
      onKeyChange={setKeyInput}
      onSubmit={saveKey}
      saving={saving}
      saveBlocked={cannotSave}
      canDelete={hasStoredKey}
      onDelete={() => void clearKey()}
      check={{ label: t.adminSettings.settings.checkButton, busy: checking, hasKey, onRun: () => void runCheck() }}
      checkResult={
        check !== null && (
          <KeyCheckResult
            summary={checkSummary(check)}
            checkedAt={check.checkedAt}
            caption={t.adminSettings.settings.checkCaption}
            rows={check.requiredModels.map((model) => ({
              id: model,
              reachable: reachable.has(model),
              detail: check.error !== null ? t.adminSettings.common.unchecked : null,
            }))}
          />
        )
      }
      announcement={announcement}
    />
  )
}
