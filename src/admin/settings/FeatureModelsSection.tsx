import { useEffect, useId, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { InfoHint } from '../../design-system/primitives/InfoHint'
import {
  JEV_MODEL_ID,
  getFeatureModels,
  listLlmModels,
  putFeatureModels,
  type AdminLlmModel,
  type FeatureModels,
} from './settingsApi'
import { ROUTE_LABEL } from './routeLabel'
import { isModelKeyMissing } from './modelKeyWarning'
import { useAdminFailure } from './useAdminRequest'

/** A select value of `''` stands for `null`, the feature's own default. */
const DEFAULT_VALUE = ''

function toValue(modelId: string | null): string {
  return modelId === null || modelId === JEV_MODEL_ID ? DEFAULT_VALUE : modelId
}

function toModelId(value: string): string | null {
  return value === DEFAULT_VALUE ? null : value
}

function ModelOptions({ models, selected }: { models: AdminLlmModel[]; selected: string }) {
  const { t } = useI18n()
  const catalogModel = models.find((model) => model.id === selected)
  // A stored model that was turned off afterwards must stay visible, not silently vanish.
  const orphan = selected !== DEFAULT_VALUE && (catalogModel === undefined || !catalogModel.enabled)
  return (
    <>
      {models
        .filter((model) => model.enabled)
        .map((model) => (
          <option key={model.id} value={model.id}>
            {model.label} · {ROUTE_LABEL[model.route]}
          </option>
        ))}
      {orphan && (
        <option value={selected} disabled>
          {t.adminSettings.featureModels.disabledInCatalog(catalogModel?.label ?? selected)}
        </option>
      )}
    </>
  )
}

function KeyMissingWarning({ id }: { id: string }) {
  const { t } = useI18n()
  return (
    <p className="adm-warning" id={id} role="status">
      <strong>! {t.adminSettings.featureModels.modelKeyMissingTitle}</strong> {t.adminSettings.featureModels.modelKeyMissing}
    </p>
  )
}

/** Which model the scenario authoring agent and the project agent use, and which one answers the Jev decision questions. */
export function FeatureModelsSection({
  openRouterKeyConfigured,
  typesafeKeyConfigured,
  claudeKeyConfigured,
  onSaved,
}: {
  /** `null` while the OpenRouter key state is still loading. */
  openRouterKeyConfigured: boolean | null
  /** `null` while the TypeSafe key state is still loading. */
  typesafeKeyConfigured: boolean | null
  /** `null` while the Claude key state is still loading. */
  claudeKeyConfigured: boolean | null
  onSaved: (message: string) => void
}) {
  const { t } = useI18n()
  const [models, setModels] = useState<AdminLlmModel[] | null>(null)
  const [saved, setSaved] = useState<FeatureModels | null>(null)
  const [authoring, setAuthoring] = useState(DEFAULT_VALUE)
  const [decision, setDecision] = useState(DEFAULT_VALUE)
  const [projectAgent, setProjectAgent] = useState(DEFAULT_VALUE)
  const [saving, setSaving] = useState(false)
  const { error, setError, fail } = useAdminFailure()
  const authoringId = useId()
  const decisionId = useId()
  const projectAgentId = useId()
  const authoringWarningId = useId()
  const projectAgentWarningId = useId()
  const warningId = useId()

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([listLlmModels(controller.signal), getFeatureModels(controller.signal)])
      .then(([loadedModels, loaded]) => {
        setModels(loadedModels)
        setSaved(loaded)
        setAuthoring(toValue(loaded.scenarioAuthoringModel))
        setDecision(toValue(loaded.decisionModel))
        setProjectAgent(toValue(loaded.projectAgentModel))
      })
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause)
      })
    return () => controller.abort()
  }, [fail])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await putFeatureModels({
        scenarioAuthoringModel: toModelId(authoring),
        decisionModel: toModelId(decision),
        projectAgentModel: toModelId(projectAgent),
      })
      setSaved(result)
      setAuthoring(toValue(result.scenarioAuthoringModel))
      setDecision(toValue(result.decisionModel))
      setProjectAgent(toValue(result.projectAgentModel))
      onSaved(t.adminSettings.featureModels.saved)
    } catch (cause) {
      fail(cause)
    } finally {
      setSaving(false)
    }
  }

  const fallback = saved?.scenarioAuthoringFallback ?? null
  const projectAgentFallback = saved?.projectAgentFallback ?? null
  const keyMissingFor = (value: string, savedValue: string | null) =>
    models !== null &&
    saved !== null &&
    isModelKeyMissing({
      modelId: toModelId(value),
      models,
      keyMissing: saved.keyMissing,
      savedModelId: savedValue,
      claudeKeyConfigured,
    })
  const authoringKeyMissing = keyMissingFor(authoring, saved?.scenarioAuthoringModel ?? null)
  const projectAgentKeyMissing = keyMissingFor(projectAgent, saved?.projectAgentModel ?? null)
  const showJevWarning = decision === DEFAULT_VALUE && openRouterKeyConfigured === false && typesafeKeyConfigured === false
  const unchanged =
    saved !== null &&
    authoring === toValue(saved.scenarioAuthoringModel) &&
    decision === toValue(saved.decisionModel) &&
    projectAgent === toValue(saved.projectAgentModel)

  return (
    <section aria-labelledby="adm-feature-models-title">
      <div className="section__head">
        <h2 className="section__title" id="adm-feature-models-title">
          {t.adminSettings.featureModels.title}
          <InfoHint>{t.adminSettings.featureModels.hint}</InfoHint>
        </h2>
      </div>
      {error !== null && (
        <p className="notice notice--critical adm-section-notice" role="alert">
          {error}
        </p>
      )}
      {models === null || saved === null ? (
        <p className="notice">
          {error === null ? t.adminSettings.featureModels.loading : t.adminSettings.featureModels.failed}
        </p>
      ) : (
        <form className="adm-panel" onSubmit={save}>
          <div className="adm-feature">
            <label className="adm-feature__label" htmlFor={authoringId}>
              {t.adminSettings.featureModels.authoring}
              <InfoHint>{t.adminSettings.featureModels.authoringHint}</InfoHint>
            </label>
            <div className="adm-feature__control">
              <select
                id={authoringId}
                className="control adm-input"
                value={authoring}
                disabled={saving}
                aria-describedby={authoringKeyMissing ? authoringWarningId : undefined}
                onChange={(event) => setAuthoring(event.target.value)}
              >
                <option value={DEFAULT_VALUE}>{t.adminSettings.featureModels.serverDefault(fallback)}</option>
                <ModelOptions models={models} selected={authoring} />
              </select>
              {authoringKeyMissing && <KeyMissingWarning id={authoringWarningId} />}
            </div>
          </div>
          <div className="adm-feature">
            <label className="adm-feature__label" htmlFor={decisionId}>
              {t.adminSettings.featureModels.decision}
              <InfoHint>{t.adminSettings.featureModels.decisionHint}</InfoHint>
            </label>
            <div className="adm-feature__control">
              <select
                id={decisionId}
                className="control adm-input"
                value={decision}
                disabled={saving}
                aria-describedby={showJevWarning ? warningId : undefined}
                onChange={(event) => setDecision(event.target.value)}
              >
                <option value={DEFAULT_VALUE}>{t.adminSettings.featureModels.jev(typesafeKeyConfigured === true)}</option>
                <ModelOptions models={models} selected={decision} />
              </select>
              {showJevWarning && (
                <p className="adm-warning" id={warningId} role="status">
                  <strong>! {t.adminSettings.featureModels.jevKeyMissingTitle}</strong>{' '}
                  {t.adminSettings.featureModels.jevKeyMissing}
                </p>
              )}
            </div>
          </div>
          <div className="adm-feature">
            <label className="adm-feature__label" htmlFor={projectAgentId}>
              {t.adminSettings.featureModels.projectAgent}
              <InfoHint>{t.adminSettings.featureModels.projectAgentHint}</InfoHint>
            </label>
            <div className="adm-feature__control">
              <select
                id={projectAgentId}
                className="control adm-input"
                value={projectAgent}
                disabled={saving}
                aria-describedby={projectAgentKeyMissing ? projectAgentWarningId : undefined}
                onChange={(event) => setProjectAgent(event.target.value)}
              >
                <option value={DEFAULT_VALUE}>
                  {t.adminSettings.featureModels.followsAuthoring(projectAgentFallback)}
                </option>
                <ModelOptions models={models} selected={projectAgent} />
              </select>
              {projectAgentKeyMissing && <KeyMissingWarning id={projectAgentWarningId} />}
            </div>
          </div>
          <div className="adm-panel__footer">
            <span className={`adm-save-state${unchanged ? '' : ' adm-save-state--dirty'}`}>
              <span className="adm-save-state__dot" aria-hidden="true" />
              {unchanged ? t.adminSettings.featureModels.upToDate : t.adminSettings.featureModels.unsaved}
            </span>
            <button type="submit" className="control control--action adm-primary" disabled={saving || unchanged}>
              {saving ? t.adminSettings.common.saving : t.adminSettings.featureModels.save}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
