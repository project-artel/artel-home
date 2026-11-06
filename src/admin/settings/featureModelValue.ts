import { JEV_MODEL_ID } from './settingsApi'

/** select 값 `''` 은 `null`, 곧 그 기능의 기본값을 뜻한다. */
export const DEFAULT_VALUE = ''

/**
 * 저장된 모델 id 를 select 값으로 바꾼다. Jev 는 결정 질문 field 의 기본값이라서 그 field 에서만
 * 기본값으로 보고(`jevIsDefault`), 다른 field 에서는 명시적으로 고른 모델로 그대로 둔다.
 */
export function toValue(modelId: string | null, jevIsDefault = false): string {
  if (modelId === null) return DEFAULT_VALUE
  return jevIsDefault && modelId === JEV_MODEL_ID ? DEFAULT_VALUE : modelId
}

export function toModelId(value: string): string | null {
  return value === DEFAULT_VALUE ? null : value
}
