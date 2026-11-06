/*
 * agent 가 보낸 문자열(id, 이름, 제목의 일부)로 목록의 항목 하나를 고른다. 화면의 목록은 agent 에게
 * field 의 options 로 나열되지 않는 것(macro, knowledge item, scenario)이 많아서, id 를 모른 채
 * 이름으로 부르는 경우를 받아 준다.
 */

/** 항목 하나를 가리키는 문자열들(id 와 이름)과, 찾지 못했을 때 보여 줄 한 줄. */
export type Lookup<T> = {
  entry: T
  /** 정확히 맞춰 볼 문자열. id 와 이름. */
  keys: string[]
  /** 부분 일치로 찾을 문자열과 오류 메시지에 쓸 이름. */
  title: string
}

const CANDIDATE_LIMIT = 5

/** scenario 목록을 lookup 으로 바꾼다. 맵 화면과 시나리오 목록이 같은 규칙(id 와 제목)을 쓴다. */
export function scenarioLookups<T>(items: readonly T[], idOf: (item: T) => string, titleOf: (item: T) => string): Lookup<T>[] {
  return items.map((item) => ({ entry: item, keys: [idOf(item)], title: titleOf(item) }))
}

/** run 목록을 lookup 으로 바꾼다. id 만 키이고 제목은 쓰지 않으므로 `resolveExactEntry` 와 함께 쓴다. */
export function runLookups<T>(items: readonly T[], idOf: (item: T) => string): Lookup<T>[] {
  return items.map((item) => ({ entry: item, keys: [idOf(item)], title: '' }))
}

/** key 가 (대소문자 무시하고) 정확히 같은 항목만 돌려준다. 부분 일치로 다른 항목을 고르지 않는다. */
export function resolveExactEntry<T>(subject: string, query: unknown, lookups: readonly Lookup<T>[]): T {
  const text = typeof query === 'string' ? query.trim() : typeof query === 'number' ? String(query) : ''
  if (text.length === 0) throw new Error(`${subject} is required.`)
  const wanted = text.toLowerCase()
  const found = lookups.filter((lookup) => lookup.keys.some((key) => key.toLowerCase() === wanted))
  if (found.length === 0) throw new Error(`No ${subject} has the id "${text}".`)
  return found[0].entry
}

/**
 * 1) `query` 가 어느 항목의 key 와 (대소문자 무시하고) 정확히 같으면 그 항목,
 * 2) 아니면 title 에 `query` 가 들어 있는 항목이 하나뿐일 때 그 항목을 돌려준다.
 * 없거나 여럿이면 후보를 적어 던진다. 여럿 가운데 임의로 하나를 고르면 agent 는 다른 항목을 연 줄
 * 모르고 이어 간다.
 */
export function resolveEntry<T>(subject: string, query: unknown, lookups: readonly Lookup<T>[]): T {
  const text = typeof query === 'string' ? query.trim() : typeof query === 'number' ? String(query) : ''
  if (text.length === 0) throw new Error(`${subject} is required.`)
  const wanted = text.toLowerCase()

  const exact = lookups.filter((lookup) => lookup.keys.some((key) => key.toLowerCase() === wanted))
  if (exact.length === 1) return exact[0].entry
  const matches = exact.length > 1 ? exact : lookups.filter((lookup) => lookup.title.toLowerCase().includes(wanted))
  if (matches.length === 1) return matches[0].entry

  if (matches.length === 0) throw new Error(`No ${subject} matches "${text}".`)
  const names = matches.slice(0, CANDIDATE_LIMIT).map((lookup) => `"${lookup.title}" (${lookup.keys[0]})`)
  const more = matches.length > CANDIDATE_LIMIT ? `, and ${matches.length - CANDIDATE_LIMIT} more` : ''
  throw new Error(`"${text}" matches ${matches.length} ${subject} entries: ${names.join(', ')}${more}. Use the id.`)
}
