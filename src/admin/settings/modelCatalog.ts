import type { AdminLlmModel, LlmModelRoute } from './settingsApi'

/** 모델 목록 화면의 group 순서와 이름. route 마다 쓰는 key 가 달라서 key 단위로 묶어 보인다. */
export const MODEL_GROUP_ORDER: readonly LlmModelRoute[] = ['openrouter', 'bedrock', 'claude', 'gpt']

export const MODEL_GROUP_LABEL: Record<LlmModelRoute, string> = {
  openrouter: 'OpenRouter',
  bedrock: 'AWS Bedrock',
  claude: 'Claude API',
  gpt: 'OpenAI API',
}

export interface ModelGroup {
  route: LlmModelRoute
  models: AdminLlmModel[]
  enabledCount: number
}

/** route 별로 묶는다. group 안의 순서는 받은 순서를 그대로 두고, 모델이 없는 route 는 빼낸다. */
export function groupModelsByRoute(models: readonly AdminLlmModel[]): ModelGroup[] {
  return MODEL_GROUP_ORDER.map((route) => {
    const routeModels = models.filter((model) => model.route === route)
    return { route, models: routeModels, enabledCount: routeModels.filter((model) => model.enabled).length }
  }).filter((group) => group.models.length > 0)
}

/** 이름, id, provider 중 하나에 검색어가 들어 있는 모델만 남긴다. 대소문자는 가리지 않는다. */
export function filterModels(models: readonly AdminLlmModel[], query: string): AdminLlmModel[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...models]
  return models.filter((model) =>
    [model.label, model.id, model.provider].some((field) => field.toLowerCase().includes(needle)),
  )
}
