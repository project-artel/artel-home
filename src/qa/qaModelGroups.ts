import { qaModelOptionKey, type QaModel } from './qaTypes'

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
 * says so is the service's. Services with a key come first, so what can be
 * picked is not buried under what cannot. Within a group the server's order is
 * kept — it is `llm_model.sort_order`.
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
    const service = model.keyProvider ?? model.provider
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
  const user = [...byProvider.values()].sort(
    (a, b) => Number(b.registered) - Number(a.registered),
  )
  return { platform, user }
}

/** The option keys the keyboard walks, in the order they are drawn. */
export function selectableQaModelKeys(groups: QaModelGroups): string[] {
  return [
    ...groups.platform,
    ...groups.user.flatMap((group) => group.models.filter((model) => model.keyRegistered)),
  ].map(qaModelOptionKey)
}
