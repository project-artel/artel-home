import { LLM_KEY_SERVICES } from '../account/llmKeyTypes'
import { qaModelOptionKey, type QaModel } from './qaTypes'

const BEDROCK_PREFIX = 'bedrock/'


/** The service a `user` model's key is registered with. */
export function qaKeyServiceOf(model: Pick<QaModel, 'keyProvider' | 'provider'>): string {
  return model.keyProvider ?? model.provider
}

/** One key service's models in the `user` section, with the state of its key. */
export type QaUserProviderGroup = {
  /** `keyProvider`, or the model's own `provider` when the server names none. */
  provider: string
  registered: boolean
  keyHint: string | null
  models: QaModel[]
}

export type QaModelGroups = {
  platform: QaModel[]
  user: QaUserProviderGroup[]
}

/**
 * The picker's two sections, narrowed to `query`.
 *
 * The `user` section is grouped by the key's service (`keyProvider`) because a
 * key belongs to that service, not to a model or to the model's maker: one
 * OpenRouter key unlocks OpenAI, xAI and Moonshot rows at once, and the row that
 * says so is the service's. Services keep the fixed order of `LLM_KEY_SERVICES`
 * whether or not they have a key, so a tab never moves when a key is added.
 * Within a group the server's order is kept — it is `llm_model.sort_order`.
 */
export function groupQaModels(models: QaModel[], query = ''): QaModelGroups {
  const needle = query.trim().toLowerCase()
  const matches = needle === ''
    ? models
    : models.filter((model) =>
        [model.label, model.provider, model.id].some((text) =>
          text.toLowerCase().includes(needle),
        ),
      )

  const platform = matches.filter((model) => model.keySource === 'platform')
  const byProvider = new Map<string, QaUserProviderGroup>()
  for (const model of matches) {
    if (model.keySource !== 'user') continue
    const service = qaKeyServiceOf(model)
    const group = byProvider.get(service) ?? {
      provider: service,
      registered: false,
      keyHint: null,
      models: [],
    }
    group.models.push(model)
    group.registered ||= model.keyRegistered
    group.keyHint ??= model.keyHint
    byProvider.set(service, group)
  }
  const rank = (service: string) => {
    const at = (LLM_KEY_SERVICES as readonly string[]).indexOf(service)
    return at === -1 ? LLM_KEY_SERVICES.length : at
  }
  const user = [...byProvider.values()].sort((a, b) => rank(a.provider) - rank(b.provider))
  return { platform, user }
}

/**
 * The models the run panel offers.
 *
 * Bedrock rows are not offered on the platform key: what testers are offered
 * free is decided per model, and Bedrock is not part of it. The rows stay in the
 * catalog — the server still routes and prices them. Turning a row off belongs
 * to the admin screen (`llm_model.enabled`, orchestration#307); once that lands,
 * this filter goes.
 */
export function offeredQaModels(models: QaModel[]): QaModel[] {
  return models.filter(
    (model) => !(model.keySource === 'platform' && model.id.startsWith(BEDROCK_PREFIX)),
  )
}

/**
 * The name a picker row shows. "Claude" is dropped from Anthropic models — the
 * provider beside the name already says it — so they read `Opus 5.5`.
 */
export function qaModelDisplayLabel(model: Pick<QaModel, 'label' | 'provider'>): string {
  return model.provider === 'anthropic' ? model.label.replace(/^Claude\s+/, '') : model.label
}

/** The option keys the keyboard walks, in the order they are drawn. */
export function selectableQaModelKeys(groups: QaModelGroups): string[] {
  return [
    ...groups.platform,
    ...groups.user.flatMap((group) => group.models.filter((model) => model.keyRegistered)),
  ].map(qaModelOptionKey)
}
