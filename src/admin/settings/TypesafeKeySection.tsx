import { useEffect, useId, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import { getTypesafeSettings, putTypesafeKey, type TypesafeSettings } from './settingsApi'
import { ConfirmButton } from './ConfirmButton'
import { useAdminFailure } from './useAdminRequest'
import { InfoHint } from '../../design-system/primitives/InfoHint'

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
  const keyFieldId = useId()

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

  return (
    <section aria-labelledby="adm-typesafe-title">
      <div className="section__head">
        <h2 className="section__title" id="adm-typesafe-title">
          {t.adminSettings.typesafe.title}
          <InfoHint>{t.adminSettings.typesafe.hint}</InfoHint>
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
        <dl className="adm-facts">
          <div>
            <dt>{t.adminSettings.common.currentKey}</dt>
            <dd className="mono">
              {settings.configured ? (settings.maskedKey ?? t.adminSettings.common.saved) : t.adminSettings.common.none}
            </dd>
          </div>
          {settings.updatedAt !== null && (
            <div>
              <dt>{t.adminSettings.common.savedAt}</dt>
              <dd>{adminFormat(locale).timestamp(settings.updatedAt)}</dd>
            </div>
          )}
        </dl>
      )}

      <form className="adm-form" onSubmit={saveKey}>
        <span className="adm-field adm-field--wide">
          <label className="field__label" htmlFor={keyFieldId}>
            {t.adminSettings.common.newKey}
            <InfoHint>{t.adminSettings.typesafe.keyHint}</InfoHint>
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
        {settings !== null && settings.configured && (
          <ConfirmButton
            label={t.adminSettings.common.deleteKey}
            confirmLabel={t.adminSettings.common.delete}
            disabled={saving}
            onConfirm={() => void save(null)}
          />
        )}
      </form>

      <p className="adm-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
