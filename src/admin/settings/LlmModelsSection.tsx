import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import { listLlmModels, replaceLlmModel, setLlmModelEnabled, type AdminLlmModel } from './settingsApi'
import { useAdminFailure } from './useAdminRequest'
import { InfoHint } from '../../design-system/primitives/InfoHint'

const ROUTE_LABEL = { openrouter: 'OpenRouter', bedrock: 'AWS Bedrock' } as const

export function ModelRow({
  model,
  pending,
  onToggle,
}: {
  model: AdminLlmModel
  pending: boolean
  onToggle: (enabled: boolean) => void
}) {
  const { t, locale } = useI18n()
  const meta = [
    model.provider,
    model.supportsVision ? t.adminSettings.models.vision : null,
    model.maxInputTokens !== null
      ? t.adminSettings.models.maxInput(adminFormat(locale).count(model.maxInputTokens))
      : null,
  ].filter((part): part is string => part !== null && part !== '')
  return (
    <li className="adm-model">
      <div className="adm-model__name">
        <div className="adm-model__label">{model.label}</div>
        <div className="adm-model__meta mono">{model.id}</div>
        <div className="adm-model__meta">{meta.join(' · ')}</div>
      </div>
      <span className="adm-badge">{ROUTE_LABEL[model.route]}</span>
      <label className="adm-switch">
        <input
          type="checkbox"
          role="switch"
          checked={model.enabled}
          disabled={pending}
          aria-label={t.adminSettings.models.use(model.label)}
          onChange={(event) => onToggle(event.target.checked)}
        />
        {model.enabled ? t.adminSettings.models.on : t.adminSettings.models.off}
      </label>
    </li>
  )
}

/** The model catalog with one switch per row. Only `enabled` can be changed here. */
export function LlmModelsSection() {
  const { t } = useI18n()
  const [models, setModels] = useState<AdminLlmModel[] | null>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const { error, setError, fail } = useAdminFailure()

  useEffect(() => {
    const controller = new AbortController()
    listLlmModels(controller.signal)
      .then(setModels)
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause)
      })
    return () => controller.abort()
  }, [fail])

  async function change(id: string, enabled: boolean) {
    if (models === null || pendingIds.has(id)) return
    setPendingIds((current) => new Set(current).add(id))
    setError(null)
    try {
      const updated = await setLlmModelEnabled(id, enabled)
      // Only this row changes, so a switch flipped meanwhile on another row is kept.
      setModels((current) => (current === null ? current : replaceLlmModel(current, updated)))
    } catch (cause) {
      fail(cause)
    } finally {
      setPendingIds((current) => {
        const rest = new Set(current)
        rest.delete(id)
        return rest
      })
    }
  }

  return (
    <section aria-labelledby="adm-models-title">
      <div className="section__head">
        <h2 className="section__title" id="adm-models-title">
          {t.adminSettings.models.title}
          <InfoHint>{t.adminSettings.models.hint}</InfoHint>
        </h2>
      </div>
      {error !== null && (
        <p className="notice notice--critical" role="alert">
          {error}
        </p>
      )}
      {models === null ? (
        <p className="notice">{error === null ? t.adminSettings.models.loading : t.adminSettings.models.failed}</p>
      ) : (
        <ul className="adm-models">
          {models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              pending={pendingIds.has(model.id)}
              onToggle={(enabled) => void change(model.id, enabled)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
