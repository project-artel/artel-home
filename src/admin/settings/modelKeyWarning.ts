import type { AdminLlmModel } from './settingsApi'

/**
 * 고른 모델에 대해 platform 에 키가 없는지 판단한다.
 *
 * `gpt` 모델은 platform 키가 아예 없다. `claude` 모델은 실시간 Claude 키 상태를, `openrouter` 모델은
 * 실시간 OpenRouter 키 상태를 따른다. 마지막 모델 load 뒤에 키를 저장하거나 삭제해도 경고가 바로 바뀐다.
 * 해당 키 상태를 아직 불러오는 중이거나 그 밖의 route 이면 서버의 `keyMissing` 목록으로 돌아가는데,
 * 이 목록은 저장된 선택만 설명한다.
 */
export function isModelKeyMissing({
  modelId,
  models,
  keyMissing,
  savedModelId,
  claudeKeyConfigured,
  openRouterKeyConfigured,
}: {
  /** select 의 현재 값. 기본값을 따르면 `null`. */
  modelId: string | null
  models: AdminLlmModel[]
  keyMissing: string[]
  /** 같은 select 에 저장된 값. 선택이 바뀌지 않은 동안만 서버 목록을 믿는다. */
  savedModelId: string | null
  /** Claude 키 상태를 아직 불러오는 중이면 `null`. */
  claudeKeyConfigured: boolean | null
  /** OpenRouter 키 상태를 아직 불러오는 중이면 `null`. */
  openRouterKeyConfigured: boolean | null
}): boolean {
  if (modelId === null) return false
  const route = models.find((model) => model.id === modelId)?.route
  if (route === 'gpt') return true
  if (route === 'claude' && claudeKeyConfigured !== null) return !claudeKeyConfigured
  if (route === 'openrouter' && openRouterKeyConfigured !== null) return !openRouterKeyConfigured
  return modelId === savedModelId && keyMissing.includes(modelId)
}
