import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import { getTypesafeSettings, putTypesafeKey, type TypesafeSettings } from './settingsApi'
import { useAdminFailure } from './useAdminRequest'
import { ProviderKeyCard, type KeyFact, type KeyStatus } from './ProviderKeyCard'

/** Direct TypeSafe (Jev) key: masked key, save, delete. There is no model check for this key. */
export function TypesafeKeySection({
  onConfiguredChange,
}: {
  /** Reports whether a key is stored, after the first load and after every save or delete. */
  onConfiguredChange: (configured: boolean) => void
}) {
  const { t, locale } = useI18n()
  const [settings, setSettings] = useState<TypesafeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const { error, setError, fail } = useAdminFailure()

  useEffect(() => {
    const controller = new AbortController()
    getTypesafeSettings(controller.signal)
      .then((loaded) => {
        setSettings(loaded)
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
      const saved = await putTypesafeKey(apiKey)
      setSettings(saved)
      onConfiguredChange(saved.configured)
      setAnnouncement(apiKey === null ? t.adminSettings.typesafe.deleted : t.adminSettings.typesafe.saved)
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
      titleId="adm-typesafe-title"
      title={t.adminSettings.typesafe.title}
      hint={t.adminSettings.typesafe.hint}
      status={status}
      facts={facts}
      error={error}
      keyHint={t.adminSettings.typesafe.keyHint}
      keyValue={keyInput}
      onKeyChange={setKeyInput}
      onSubmit={saveKey}
      saving={saving}
      canDelete={hasKey}
      onDelete={() => void save(null)}
      check={null}
      announcement={announcement}
    />
  )
}
