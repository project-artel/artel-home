import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import {
  checkClaudeModels,
  getClaudeSettings,
  putClaudeKey,
  type ClaudeCheck,
  type ClaudeSettings,
} from './settingsApi'
import { useAdminFailure } from './useAdminRequest'
import { KeyCheckResult, ProviderKeyCard, type KeyFact, type KeyStatus } from './ProviderKeyCard'

export function ClaudeCheckResult({ check }: { check: ClaudeCheck }) {
  const { t, locale } = useI18n()
  const format = adminFormat(locale)
  const reachableCount = check.models.filter((model) => model.reachable).length
  return (
    <KeyCheckResult
      summary={
        !check.keyConfigured
          ? t.adminSettings.claude.noKey
          : check.models.length === 0
            ? t.adminSettings.claude.noModels
            : t.adminSettings.claude.checkSummary(format.count(check.models.length), format.count(reachableCount))
      }
      checkedAt={check.checkedAt}
      caption={t.adminSettings.claude.checkCaption}
      rows={check.models.map((model) => ({
        id: model.id,
        reachable: model.reachable,
        detail: model.reachable ? null : model.error,
      }))}
    />
  )
}

/** Claude API key: same save, delete and check states as the Bedrock card. */
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
        ]

  return (
    <ProviderKeyCard
      titleId="adm-claude-title"
      title={t.adminSettings.claude.title}
      hint={t.adminSettings.claude.hint}
      status={status}
      facts={facts}
      error={error}
      keyHint={t.adminSettings.claude.keyHint}
      keyValue={keyInput}
      onKeyChange={setKeyInput}
      onSubmit={saveKey}
      saving={saving}
      canDelete={hasKey}
      onDelete={() => void save(null)}
      check={{ label: t.adminSettings.claude.checkButton, busy: checking, hasKey, onRun: () => void runCheck() }}
      checkResult={check !== null && <ClaudeCheckResult check={check} />}
      announcement={announcement}
    />
  )
}
