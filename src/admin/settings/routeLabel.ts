import type { LlmModelRoute } from './settingsApi'

export const ROUTE_LABEL: Record<LlmModelRoute, string> = {
  openrouter: 'OpenRouter',
  bedrock: 'AWS Bedrock',
  claude: 'Claude',
  gpt: 'GPT',
}
