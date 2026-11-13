import type { QaModel } from '../qa/qaTypes'

/**
 * 시나리오 생성 챗봇에서 우리가 권하는 모델(ARTEL-1428) — GPT-6 Luna. 공용 키(`openai/`), OpenRouter, OpenAI 직접(`gpt/`)
 * 어느 길로 부르든 같은 모델이라 id 의 끝으로 가른다.
 */
export function isRecommendedAuthoringModel(model: Pick<QaModel, 'id'>): boolean {
  return model.id.endsWith('/gpt-6-luna')
}
