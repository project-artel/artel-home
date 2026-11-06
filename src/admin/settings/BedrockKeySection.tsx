import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import {
  checkBedrockModels,
  getBedrockSettings,
  putBedrockKey,
  type BedrockCheck,
  type BedrockSettings,
} from './settingsApi'
import { useAdminFailure } from './useAdminRequest'
import { KeyCheckResult, ProviderKeyCard, type KeyFact, type KeyStatus } from './ProviderKeyCard'

export function BedrockCheckResult({ check }: { check: BedrockCheck }) {
  const { t, locale } = useI18n()
  const format = adminFormat(locale)
  const reachableCount = check.models.filter((model) => model.reachable).length
  return (
    <KeyCheckResult
      summary={
        !check.keyConfigured
          ? t.adminSettings.bedrock.noKey
          : check.models.length === 0
            ? t.adminSettings.bedrock.noModels
            : t.adminSettings.bedrock.checkSummary(format.count(check.models.length), format.count(reachableCount))
      }
      checkedAt={check.checkedAt}
      caption={t.adminSettings.bedrock.checkCaption}
      rows={check.models.map((model) => ({
        id: model.id,
        reachable: model.reachable,
        detail: model.reachable ? null : model.error,
      }))}
    />
  )
}

/** AWS Bedrock 키 카드. 저장, 삭제, 확인 상태는 OpenRouter 카드와 같다. */
export function BedrockKeySection() {
  const { t, locale } = useI18n()
  const [settings, setSettings] = useState<BedrockSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<BedrockCheck | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const { error, setError, fail } = useAdminFailure()

  useEffect(() => {
    const controller = new AbortController()
    getBedrockSettings(controller.signal)
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

  async function save(apiKey: string | null) {
    setSaving(true)
    setError(null)
    try {
      const saved = await putBedrockKey(apiKey)
      setSettings(saved)
      setCheck(saved.lastCheck)
      setAnnouncement(apiKey === null ? t.adminSettings.bedrock.deleted : t.adminSettings.bedrock.saved)
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
      const result = await checkBedrockModels()
      setCheck(result)
      setSettings((current) => (current === null ? current : { ...current, lastCheck: result }))
      setAnnouncement(t.adminSettings.bedrock.checked(adminFormat(locale).count(result.models.length)))
    } catch (cause) {
      fail(cause)
    } finally {
      setChecking(false)
    }
  }

  const hasKey = settings !== null && settings.configured
  const status: KeyStatus = settings === null ? (loading ? 'loading' : 'failed') : hasKey ? 'configured' : 'missing'
  const facts: KeyFact[] =
    settings === null
      ? []
      : [
          ...(settings.configured
            ? [{ label: t.adminSettings.common.currentKey, value: settings.maskedKey ?? t.adminSettings.common.saved, mono: true }]
            : []),
          ...(settings.updatedAt !== null
            ? [{ label: t.adminSettings.common.savedAt, value: adminFormat(locale).timestamp(settings.updatedAt) }]
            : []),
          { label: t.adminSettings.bedrock.region, value: settings.region ?? t.adminSettings.common.unknown, mono: true },
        ]

  return (
    <ProviderKeyCard
      titleId="adm-bedrock-title"
      title={t.adminSettings.bedrock.title}
      hint={t.adminSettings.bedrock.hint}
      status={status}
      facts={facts}
      error={error}
      keyHint={t.adminSettings.bedrock.keyHint}
      keyValue={keyInput}
      onKeyChange={setKeyInput}
      onSubmit={saveKey}
      saving={saving}
      canDelete={hasKey}
      onDelete={() => void save(null)}
      check={{ label: t.adminSettings.bedrock.checkButton, busy: checking, hasKey, onRun: () => void runCheck() }}
      checkResult={check !== null && <BedrockCheckResult check={check} />}
      announcement={announcement}
    />
  )
}
