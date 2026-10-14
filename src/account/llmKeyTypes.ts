/**
 * The services a user registers an LLM API key with, in the order every screen
 * lists them — the account panel's rows and the model picker's tabs. A Claude
 * key reaches Anthropic's models, a GPT key OpenAI's, and an OpenRouter key both
 * and more, through catalog rows of its own.
 */
export const LLM_KEY_SERVICES = ['anthropic', 'openai', 'openrouter'] as const
export type LlmKeyService = (typeof LLM_KEY_SERVICES)[number]

/**
 * Product names, the same in every language: a user knows the key as a "Claude"
 * or "GPT" key, not by the company that issues it.
 */
const LLM_KEY_SERVICE_NAMES: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'GPT',
  openrouter: 'OpenRouter',
}

/** The name a screen shows for a key service. An unknown one keeps the server's id. */
export function llmKeyServiceName(service: string): string {
  return LLM_KEY_SERVICE_NAMES[service] ?? service
}

/** A key the server has verified and stored. The key itself never comes back. */
export type LlmKey = {
  service: LlmKeyService
  /** The key with all but its ends masked (`sk-ant-…4f2a`). */
  keyHint: string
  verifiedAt: string
}

/**
 * Why a key was not registered.
 *
 * `invalid` and `permission_denied` are the provider's answer about the key —
 * refuse it and say why. `unverified` means the provider could not be asked, so
 * nothing is known about the key and the user should try again rather than be
 * told it is wrong. `failed` is anything else.
 *
 * There is no "no credit": the server checks a key with a read (a models list,
 * or OpenRouter's key info), which answers the same for an account that cannot
 * pay. Such a key is stored and its first run fails.
 */
export type LlmKeyRefusal = 'invalid' | 'permission_denied' | 'unverified' | 'failed'
