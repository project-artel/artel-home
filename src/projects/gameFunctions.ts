import { asNullableString, asRecord, asString } from './projectApi'

/**
 * 게임이 등록한 cheat 와 behavior 목록(ARTEL-1051).
 *
 * 모양은 `.plan/general/2026-10-14-game-functions-wire-contract.md` 의 1절과 5절이다. SDK 가
 * 보낸 항목이 orchestration 을 거쳐 그대로 오므로 cheat 와 behavior 가 같은 모양을 쓴다.
 */

/** 인자 하나. `type` 은 계약상 다섯 값이지만 모르는 값이 와도 이름 그대로 보인다. */
export type GameFunctionParam = {
  name: string
  type: string
  /** `[CheatRange]` 가 없으면 null. */
  min: number | null
  max: number | null
  /** C# 기본값을 JSON 으로 옮긴 것. 없으면 null. */
  defaultValue: string | number | boolean | null
  /** `type` 이 `enum` 일 때의 값 이름. 그 밖에는 null. */
  values: string[] | null
}

export type GameFunction = {
  name: string
  description: string
  params: GameFunctionParam[]
  /** 인스턴스 메서드가 달린 `MonoBehaviour` 이름. static 이면 null. */
  targetComponent: string | null
  /** behavior 에만 있다. */
  group: string | null
}

export type GameFunctionCatalog = {
  /** 한 번도 보낸 적 없는 build 는 0 이다. */
  revision: number
  receivedAt: string | null
  cheats: GameFunction[]
  behaviors: GameFunction[]
}

export const EMPTY_GAME_FUNCTION_CATALOG: GameFunctionCatalog = {
  revision: 0,
  receivedAt: null,
  cheats: [],
  behaviors: [],
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asDefaultValue(value: unknown): GameFunctionParam['defaultValue'] {
  return typeof value === 'string' || typeof value === 'boolean' || asFiniteNumber(value) !== null
    ? (value as GameFunctionParam['defaultValue'])
    : null
}

function parseParam(data: unknown): GameFunctionParam | null {
  const record = asRecord(data)
  const name = asString(record?.name)
  if (record === null || name.length === 0) return null

  const values = Array.isArray(record.values)
    ? record.values.filter((value): value is string => typeof value === 'string')
    : null

  return {
    name,
    type: asString(record.type, 'string'),
    min: asFiniteNumber(record.min),
    max: asFiniteNumber(record.max),
    defaultValue: asDefaultValue(record.default),
    values: values !== null && values.length > 0 ? values : null,
  }
}

/** 이름이 없는 항목은 어느 쪽에서도 고를 수 없으므로 버린다. */
function parseFunction(data: unknown): GameFunction | null {
  const record = asRecord(data)
  const name = asString(record?.name)
  if (record === null || name.length === 0) return null

  const params = Array.isArray(record.params)
    ? record.params.map(parseParam).filter((param): param is GameFunctionParam => param !== null)
    : []
  const component = asNullableString(asRecord(record.target)?.component)

  return {
    name,
    description: asString(record.description),
    params,
    targetComponent: component !== null && component.length > 0 ? component : null,
    group: asNullableString(record.group),
  }
}

function parseFunctions(value: unknown): GameFunction[] {
  if (!Array.isArray(value)) return []
  return value.map(parseFunction).filter((entry): entry is GameFunction => entry !== null)
}

/**
 * `GET .../game-builds/:gameBuildId/game-functions` 응답.
 *
 * 응답이 객체가 아니면 빈 catalog 로 읽지 않고 null 을 돌려준다. 빈 catalog 는 "이 build 는 아무것도
 * 등록하지 않았다" 는 사실이라, 읽지 못한 응답을 그렇게 읽으면 오류가 빈 상태로 바뀐다.
 */
export function parseGameFunctionCatalog(data: unknown): GameFunctionCatalog | null {
  const record = asRecord(data)
  if (record === null) return null

  const revision = asFiniteNumber(record.revision)
  return {
    revision: revision !== null && revision >= 0 ? Math.floor(revision) : 0,
    receivedAt: asNullableString(record.receivedAt),
    cheats: parseFunctions(record.cheats),
    behaviors: parseFunctions(record.behaviors),
  }
}

export function isCatalogEmpty(catalog: GameFunctionCatalog): boolean {
  return catalog.cheats.length === 0 && catalog.behaviors.length === 0
}

/** `1 – 100`, `≥ 1`, `≤ 100`. 범위가 없으면 null. */
export function describeParamRange(param: GameFunctionParam): string | null {
  const { min, max } = param
  if (min !== null && max !== null) return `${min} – ${max}`
  if (min !== null) return `≥ ${min}`
  if (max !== null) return `≤ ${max}`
  return null
}

/** 한 항목의 인자를 `amount: int (1 – 100)` 한 줄씩으로. enum 은 값 이름을 잇는다. */
export function describeParam(param: GameFunctionParam): string {
  const detail =
    param.type === 'enum' && param.values !== null
      ? param.values.join(' | ')
      : describeParamRange(param)
  return detail === null ? `${param.name}: ${param.type}` : `${param.name}: ${param.type} (${detail})`
}
