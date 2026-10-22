import type { AdminLlmModel } from './settingsApi'

/**
 * Whether the platform has no key for the selected model.
 *
 * `gpt` models never have a platform key. A `claude` model follows the live Claude key status, which also
 * covers a key saved or deleted after the last model load. Any other route (and a claude model while that
 * status is still loading) falls back to the server's `keyMissing` list, which only describes the saved choice.
 */
export function isModelKeyMissing({
  modelId,
  models,
  keyMissing,
  savedModelId,
  claudeKeyConfigured,
}: {
  /** The select's current value; `null` when it follows a default. */
  modelId: string | null
  models: AdminLlmModel[]
  keyMissing: string[]
  /** The saved value of the same select; the server list is only trusted while the selection is unchanged. */
  savedModelId: string | null
  /** `null` while the Claude key state is still loading. */
  claudeKeyConfigured: boolean | null
}): boolean {
  if (modelId === null) return false
  const route = models.find((model) => model.id === modelId)?.route
  if (route === 'gpt') return true
  if (route === 'claude' && claudeKeyConfigured !== null) return !claudeKeyConfigured
  return modelId === savedModelId && keyMissing.includes(modelId)
}
