import { Button } from '../../design-system/primitives/Button'
import { useEffect, useId, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { adminFormat } from '../shared/format'
import {
  discoverLlmModels,
  importLlmModel,
  listLlmModels,
  replaceLlmModel,
  setLlmModelEnabled,
  type AdminLlmModel,
  type LlmDiscoveryProvider,
  type LlmModelCandidate,
  type LlmModelRoute,
} from './settingsApi'
import { MODEL_GROUP_LABEL, filterModels, groupModelsByRoute, type ModelGroup } from './modelCatalog'
import { useAdminFailure } from './useAdminRequest'
import { InfoHint } from '../../design-system/primitives/InfoHint'
import { CollapseIcon } from '../../design-system/primitives/CollapseIcon'

const PROVIDERS: readonly LlmDiscoveryProvider[] = ['openrouter', 'openai', 'claude']
const PROVIDER_LABEL = {
  openrouter: MODEL_GROUP_LABEL.openrouter,
  openai: MODEL_GROUP_LABEL.gpt,
  claude: MODEL_GROUP_LABEL.claude,
} as const

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
    model.supportsVision ? t.adminSettings.models.vision : null,
    model.maxInputTokens !== null
      ? t.adminSettings.models.maxInput(adminFormat(locale).count(model.maxInputTokens))
      : null,
  ].filter((part): part is string => part !== null)
  return (
    <li className={`adm-model${model.enabled ? '' : ' adm-model--off'}`}>
      <span className="adm-model__label">{model.label}</span>
      <span className="adm-model__id mono">{model.id}</span>
      <span className="adm-model__meta">{meta.join(' · ')}</span>
      <label className="adm-switch">
        <input
          type="checkbox"
          role="switch"
          checked={model.enabled}
          disabled={pending}
          aria-label={t.adminSettings.models.use(model.label)}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="adm-switch__text">{model.enabled ? t.adminSettings.models.on : t.adminSettings.models.off}</span>
      </label>
    </li>
  )
}

function ModelGroupBlock({
  group,
  expanded,
  onExpandedChange,
  pendingIds,
  onToggle,
}: {
  group: ModelGroup
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  pendingIds: ReadonlySet<string>
  onToggle: (id: string, enabled: boolean) => void
}) {
  const { t, locale } = useI18n()
  const format = adminFormat(locale)
  const listId = useId()
  return (
    <div className="adm-model-group">
      <button
        type="button"
        className="adm-model-group__head"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => onExpandedChange(!expanded)}
      >
        <span className={`adm-model-group__icon${expanded ? ' adm-model-group__icon--open' : ''}`}>
          <CollapseIcon direction="right" />
        </span>
        <span className="adm-model-group__name">{MODEL_GROUP_LABEL[group.route]}</span>
        <span className="adm-model-group__count">
          {t.adminSettings.models.enabledCount(format.count(group.enabledCount), format.count(group.models.length))}
        </span>
      </button>
      {expanded && (
        <ul className="adm-models" id={listId}>
          {group.models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              pending={pendingIds.has(model.id)}
              onToggle={(enabled) => onToggle(model.id, enabled)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export function LlmModelsSection() {
  const { t, locale } = useI18n()
  const [models, setModels] = useState<AdminLlmModel[] | null>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const [expandedRoutes, setExpandedRoutes] = useState<ReadonlySet<LlmModelRoute>>(new Set())
  const [provider, setProvider] = useState<LlmDiscoveryProvider>('openrouter')
  const [candidates, setCandidates] = useState<LlmModelCandidate[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'adding'>('idle')
  const { error, setError, fail } = useAdminFailure()
  const filterId = useId()
  const providerId = useId()
  const candidateId = useId()

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

  function setExpanded(route: LlmModelRoute, expanded: boolean) {
    setExpandedRoutes((current) => {
      const next = new Set(current)
      if (expanded) next.add(route)
      else next.delete(route)
      return next
    })
  }

  async function discover() {
    setImportStatus('loading')
    setError(null)
    setCandidates(null)
    setSelectedId('')
    try {
      setCandidates(await discoverLlmModels(provider))
    } catch (cause) {
      fail(cause)
    } finally {
      setImportStatus('idle')
    }
  }

  async function add() {
    if (!selectedId) return
    setImportStatus('adding')
    setError(null)
    try {
      const added = await importLlmModel(provider, selectedId)
      setModels((current) => {
        if (current === null) return [added]
        return current.some((model) => model.id === added.id) ? replaceLlmModel(current, added) : [...current, added]
      })
      setCandidates((current) => current?.filter((model) => model.id !== selectedId) ?? null)
      setSelectedId('')
      setQuery('')
      setExpanded(added.route, true)
    } catch (cause) {
      fail(cause)
    } finally {
      setImportStatus('idle')
    }
  }

  const format = adminFormat(locale)
  const copy = t.adminSettings.modelImport
  const filtering = query.trim() !== ''
  const groups = models === null ? [] : groupModelsByRoute(filterModels(models, query))
  const enabledTotal = models?.filter((model) => model.enabled).length ?? 0

  return (
    <section aria-labelledby="adm-models-title">
      <div className="section__head">
        <h2 className="section__title" id="adm-models-title">
          {t.adminSettings.models.title}
          <InfoHint>{t.adminSettings.models.hint}</InfoHint>
        </h2>
        {models !== null && (
          <span className="section__note">
            {t.adminSettings.models.enabledCount(format.count(enabledTotal), format.count(models.length))}
          </span>
        )}
      </div>
      {models !== null && (
        <div className="adm-form">
          <span className="adm-field">
            <label className="field__label" htmlFor={providerId}>
              {copy.provider}
            </label>
            <select
              id={providerId}
              className="control adm-input"
              value={provider}
              disabled={importStatus !== 'idle'}
              onChange={(event) => {
                const next = PROVIDERS.find((value) => value === event.target.value)
                if (next === undefined) return
                setProvider(next)
                setCandidates(null)
                setSelectedId('')
                setError(null)
              }}
            >
              {PROVIDERS.map((value) => (
                <option key={value} value={value}>
                  {PROVIDER_LABEL[value]}
                </option>
              ))}
            </select>
          </span>
          <button type="button" className="control" disabled={importStatus !== 'idle'} onClick={() => void discover()}>
            {importStatus === 'loading' ? copy.loading : copy.discover}
          </button>
          {candidates !== null && candidates.length > 0 && (
            <>
              <span className="adm-field adm-field--wide adm-model-candidates">
                <label className="field__label" htmlFor={candidateId}>
                  {copy.candidate}
                </label>
                <select
                  id={candidateId}
                  className="control adm-input"
                  value={selectedId}
                  disabled={importStatus !== 'idle'}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  <option value="">{copy.select}</option>
                  {candidates.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                    </option>
                  ))}
                </select>
              </span>
              <Button
                type="button"
                variant="secondary" size="compact"
                disabled={importStatus !== 'idle' || !selectedId}
                onClick={() => void add()}
              >
                {importStatus === 'adding' ? copy.adding : copy.add}
              </Button>
            </>
          )}
          {candidates?.length === 0 && (
            <span className="section__note" role="status">
              {copy.empty}
            </span>
          )}
        </div>
      )}
      {error !== null && (
        <p className="notice notice--critical adm-section-notice" role="alert">
          {error}
        </p>
      )}
      {models === null ? (
        <p className="notice">{error === null ? t.adminSettings.models.loading : t.adminSettings.models.failed}</p>
      ) : (
        <div className="adm-panel adm-panel--flush">
          <div className="adm-models-toolbar">
            <label className="adm-visually-hidden" htmlFor={filterId}>
              {t.adminSettings.models.filter}
            </label>
            <input
              id={filterId}
              className="control adm-input adm-models-toolbar__filter"
              type="search"
              placeholder={t.adminSettings.models.filterPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {groups.length === 0 ? (
            <p className="adm-models-empty">{t.adminSettings.models.noMatch}</p>
          ) : (
            groups.map((group) => (
              <ModelGroupBlock
                key={group.route}
                group={group}
                // 검색어가 있으면 일치하는 모델이 남은 group 을 모두 펼쳐서, 일치하는 모델이 접힌 채 가려지지 않게 한다.
                expanded={filtering || expandedRoutes.has(group.route)}
                onExpandedChange={(expanded) => setExpanded(group.route, expanded)}
                pendingIds={pendingIds}
                onToggle={(id, enabled) => void change(id, enabled)}
              />
            ))
          )}
        </div>
      )}
    </section>
  )
}
