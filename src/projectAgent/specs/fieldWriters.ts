import { tasksCopy } from '../tasksCopy'

/*
 * 페이지 field 의 write 가 쓰는 검사. 모르는 값은 조용히 무시하지 않고 던진다. registry 가 던진 것을
 * `error` 결과로 바꾸므로 agent 는 무엇이 틀렸는지 듣는다. 무시하면 agent 는 값이 바뀐 줄 안다.
 *
 * registry 도 setField 전에 options 로 한 번 검사하지만, 강조 표시 600ms 사이에 목록이 바뀔 수 있어
 * 쓰는 순간에 다시 본다.
 */

/** `value` 가 `ids` 가운데 하나면 그 id 를, 아니면 던진다. 숫자로 온 id 도 받는다. */
export function requireKnownId(field: string, value: unknown, ids: readonly string[]): string {
  const id = typeof value === 'string' || typeof value === 'number' ? String(value) : null
  if (id === null || !ids.includes(id)) throw new Error(tasksCopy().errors.unknownFieldValue(field, JSON.stringify(value) ?? String(value)))
  return id
}

export function requireBoolean(field: string, value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error(tasksCopy().errors.booleanRequired(field))
  return value
}

/** reasoning 값이 받을 수 있는 범위. effort 는 index, max_tokens 는 token 수다. */
export type ReasoningRange =
  | { kind: 'effort'; effortCount: number }
  | { kind: 'max_tokens'; minTokens: number; maxTokens: number }
  | null

/** 범위 안의 정수면 숫자로, 아니면 던진다. 문자열로 온 숫자도 받는다. */
export function requireReasoningValue(value: unknown, range: ReasoningRange): number {
  const errors = tasksCopy().errors
  if (range === null || (range.kind === 'effort' && range.effortCount === 0)) throw new Error(errors.reasoningUnsupported)
  const [min, max] = range.kind === 'effort' ? [0, range.effortCount - 1] : [range.minTokens, range.maxTokens]
  const next = typeof value === 'number' ? value : typeof value === 'string' && value.trim().length > 0 ? Number(value) : Number.NaN
  if (!Number.isInteger(next) || next < min || next > max) throw new Error(errors.reasoningValueOutOfRange(min, max))
  return next
}
