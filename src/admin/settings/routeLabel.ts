import type { LlmModelRoute } from './settingsApi'

export const ROUTE_LABEL: Record<LlmModelRoute, string> = {
  openrouter: 'OpenRouter',
  claude: 'Claude',
  gpt: 'GPT',
}
