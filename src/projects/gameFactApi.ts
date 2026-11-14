import { apiFetch } from '../auth/authApi'
import { asRecord, projectPath, readJson } from './projectApi'

export const GAME_FACT_SCOPES = ['objects', 'statics'] as const
export const GAME_FACT_TYPES = ['integer', 'number', 'boolean', 'string'] as const

/** 코딩 에이전트가 MCP 로 선언한 fact 하나. 엔진이 읽는 게임 값에 플레이어 말로 이름과 뜻을 붙인다. */
export interface GameFact {
  id: string
  name: string
  scope: typeof GAME_FACT_SCOPES[number]
  member: string
  type: typeof GAME_FACT_TYPES[number]
  unit: string | null
  means: string
  gameBuildId: string
  version: number
  updatedAt: string
}

/** 게임이 어떻게 도는지 한 문장. 다루는 fact 의 이름을 함께 가진다. */
export interface GameRule {
  id: string
  name: string
  says: string
  facts: string[]
  gameBuildId: string
  version: number
  updatedAt: string
}

/** 서버가 fact 와 rule 을 한 응답에 싣는다 — rule 이 fact 를 가리키므로 따로 읽으면 짝이 어긋날 수 있다. */
export interface GameFactBook {
  facts: GameFact[]
  rules: GameRule[]
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isVersion = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1

export function parseGameFact(value: unknown): GameFact {
  const record = asRecord(value)
  if (!record || !['id', 'name', 'member', 'means', 'gameBuildId', 'updatedAt'].every((key) => isString(record[key])) ||
      !GAME_FACT_SCOPES.some((scope) => scope === record.scope) ||
      !GAME_FACT_TYPES.some((type) => type === record.type) ||
      (record.unit !== null && record.unit !== undefined && !isString(record.unit)) ||
      !isVersion(record.version)) {
    throw new Error('Invalid game fact response')
  }
  return {
    id: record.id as string,
    name: record.name as string,
    scope: record.scope as GameFact['scope'],
    member: record.member as string,
    type: record.type as GameFact['type'],
    unit: isString(record.unit) && record.unit.length > 0 ? record.unit : null,
    means: record.means as string,
    gameBuildId: record.gameBuildId as string,
    version: record.version as number,
    updatedAt: record.updatedAt as string,
  }
}

export function parseGameRule(value: unknown): GameRule {
  const record = asRecord(value)
  if (!record || !['id', 'name', 'says', 'gameBuildId', 'updatedAt'].every((key) => isString(record[key])) ||
      !Array.isArray(record.facts) || !record.facts.every(isString) ||
      !isVersion(record.version)) {
    throw new Error('Invalid game rule response')
  }
  return {
    id: record.id as string,
    name: record.name as string,
    says: record.says as string,
    facts: record.facts as string[],
    gameBuildId: record.gameBuildId as string,
    version: record.version as number,
    updatedAt: record.updatedAt as string,
  }
}

export function parseGameFactBook(value: unknown): GameFactBook {
  const body = asRecord(value)
  if (!body || !Array.isArray(body.facts) || !Array.isArray(body.rules)) throw new Error('Invalid game fact list response')
  return { facts: body.facts.map(parseGameFact), rules: body.rules.map(parseGameRule) }
}

/** 프로젝트의 fact 와 rule. 빌드마다 따로 두지 않고 프로젝트 하나에 한 벌이다. */
export async function fetchGameFactBook(projectId: string, signal?: AbortSignal): Promise<GameFactBook> {
  const response = await apiFetch(projectPath(projectId, '/game-facts'), { signal })
  return parseGameFactBook(await readJson(response))
}

/** fact 이름마다 그 fact 를 말하는 rule 의 수. */
export function rulesPerFact(book: GameFactBook): Map<string, number> {
  const counts = new Map<string, number>()
  for (const rule of book.rules) {
    for (const fact of new Set(rule.facts)) counts.set(fact, (counts.get(fact) ?? 0) + 1)
  }
  return counts
}
