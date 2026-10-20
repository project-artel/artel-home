import { MAX_BULK_SELECTION } from './testCaseTypes'

/**
 * `testCases.delete` 가 받은 id 목록을 API 에 보낼 목록으로 만든다. 같은 id 는 한 번만 남기고,
 * 비었거나 목록에 없는 id 가 있거나 한 번에 지울 수 있는 수(500)를 넘으면 API 를 부르기 전에 던진다.
 */
export function planDeleteCases(rawIds: unknown, knownIds: ReadonlySet<string>): string[] {
  const ids = [...new Set(Array.isArray(rawIds) ? (rawIds as string[]) : [])]
  if (ids.length === 0) throw new Error('testCaseIds must list at least one id.')
  if (ids.length > MAX_BULK_SELECTION) {
    throw new Error(`testCaseIds lists ${ids.length} ids; delete at most ${MAX_BULK_SELECTION} per call and split the rest into more calls.`)
  }
  const unknown = ids.filter((id) => !knownIds.has(id))
  if (unknown.length > 0) throw new Error(`No test case has the id ${unknown.join(', ')}.`)
  return ids
}
