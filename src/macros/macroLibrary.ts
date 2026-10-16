import type { GameBuild } from '../projects/gameTypes'
import type { DeveloperMacroSummary } from './developerMacroTypes'
import type { MacroSummary } from './macroTypes'

/*
 * Macro 라이브러리의 목록 규칙 (ARTEL-1102).
 *
 * agent macro(tool loop agent 가 build 마다 저장한 것)와 developer macro(개발자가 MCP 로
 * 프로젝트에 등록한 것)는 같은 DSL 의 `def` 하나라는 점에서 같은 단위다. 그래서 화면은 둘을
 * 한 목록으로 합치고, 출처는 필터로만 가른다. 여기에는 그 목록을 만드는 순수 함수만 있다 —
 * 합치기, 검색과 출처 필터, 주소 parameter, 버전 목록 순서.
 */

export type MacroOrigin = 'agent' | 'developer'

/** 라이브러리의 한 줄. `key` 는 주소의 `macro` 값과 같고 출처를 앞에 단다. */
export type LibraryMacro =
  | { origin: 'agent'; key: string; name: string; macro: MacroSummary }
  | { origin: 'developer'; key: string; name: string; macro: DeveloperMacroSummary }

/** 고른 macro. 주소의 `macro` parameter 를 읽은 값이다. */
export type MacroSelection = { origin: 'agent'; id: string } | { origin: 'developer'; name: string }

/**
 * `macro` parameter 의 값. `agent:<id>` 또는 `developer:<name>`.
 *
 * 두 출처가 한 칸을 같이 쓰므로 출처를 앞에 단다. agent macro 는 숫자 id 로, developer macro
 * 는 이름으로 고르는데, 접두어가 없으면 `7` 이라는 이름의 developer macro 와 id 7 인 agent
 * macro 를 가를 수 없다.
 */
export function formatMacroParam(selection: MacroSelection): string {
  return selection.origin === 'agent' ? `agent:${selection.id}` : `developer:${selection.name}`
}

/** 읽을 수 없는 값은 `null` 이다. 접두어가 없던 옛 `?macro=7` 도 여기에 든다. */
export function parseMacroParam(value: string | null): MacroSelection | null {
  if (value === null) return null
  const separator = value.indexOf(':')
  if (separator < 0) return null

  const origin = value.slice(0, separator)
  const rest = value.slice(separator + 1).trim()
  if (rest.length === 0) return null
  if (origin === 'agent') return { origin: 'agent', id: rest }
  if (origin === 'developer') return { origin: 'developer', name: rest }
  return null
}

/**
 * 고른 build 의 agent macro 와 프로젝트의 developer macro 를 한 목록으로.
 *
 * 이름 오름차순이고, 이름이 같으면 agent macro 가 앞이다. 두 출처는 이름 공간이 달라 같은
 * 이름이 둘 다 있을 수 있다.
 */
export function mergeMacros(
  agentMacros: MacroSummary[],
  developerMacros: DeveloperMacroSummary[],
): LibraryMacro[] {
  const merged: LibraryMacro[] = [
    ...agentMacros.map((macro): LibraryMacro => ({
      origin: 'agent',
      key: formatMacroParam({ origin: 'agent', id: macro.id }),
      name: macro.name,
      macro,
    })),
    ...developerMacros.map((macro): LibraryMacro => ({
      origin: 'developer',
      key: formatMacroParam({ origin: 'developer', name: macro.name }),
      name: macro.name,
      macro,
    })),
  ]
  return merged.sort((left, right) => {
    const byName = left.name.localeCompare(right.name)
    if (byName !== 0) return byName
    return left.origin === right.origin ? 0 : left.origin === 'agent' ? -1 : 1
  })
}

/** 한 줄의 parameter 이름들. agent macro 는 `{name, type}`, developer macro 는 이름뿐이다. */
export function libraryParameterNames(item: LibraryMacro): string[] {
  return item.origin === 'agent'
    ? item.macro.parameters.map((parameter) => parameter.name)
    : item.macro.parameters
}

/** docstring. agent macro 는 서버가 docstring 을 보내지 않아 늘 `''` 이다. */
export function libraryDocstring(item: LibraryMacro): string {
  return item.origin === 'developer' ? item.macro.docstring : ''
}

/** 목록 줄에 쓰는 docstring 의 첫 줄. 비어 있지 않은 첫 줄이다. */
export function firstDocstringLine(docstring: string): string {
  for (const line of docstring.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length > 0) return trimmed
  }
  return ''
}

export type OriginFilter = 'ALL' | 'AGENT' | 'DEVELOPER'

/**
 * 검색어로 거른다. 이름, parameter 이름, docstring 중 하나라도 담으면 남는다. 대소문자를
 * 가리지 않고, 빈 검색어는 전부 남긴다.
 */
export function searchMacros(items: LibraryMacro[], query: string): LibraryMacro[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return items
  return items.filter((item) =>
    [item.name, ...libraryParameterNames(item), libraryDocstring(item)].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  )
}

export function filterByOrigin(items: LibraryMacro[], origin: OriginFilter): LibraryMacro[] {
  if (origin === 'ALL') return items
  const wanted: MacroOrigin = origin === 'AGENT' ? 'agent' : 'developer'
  return items.filter((item) => item.origin === wanted)
}

/** 출처 필터 칩에 붙이는 수. 검색을 거친 뒤, 출처로 거르기 전의 목록에서 센다. */
export function countByOrigin(items: LibraryMacro[]): Record<OriginFilter, number> {
  const agent = items.filter((item) => item.origin === 'agent').length
  return { ALL: items.length, AGENT: agent, DEVELOPER: items.length - agent }
}

/**
 * 버전 목록의 순서. game version build 를 `createdAt` 이 늦은 것부터, editor build 는 맨
 * 아래다.
 *
 * 케이스 라이브러리처럼 최신 버전이 맨 위다. editor build 를 맨 아래에 두는 것은 이 섹션의
 * build picker 가 서버 순서를 따라 그랬던 자리를 지킨 것이다. `createdAt` 이 같으면 받은
 * 순서를 지킨다(`Array.prototype.sort` 는 안정 정렬이다).
 */
export function orderLibraryBuilds(builds: GameBuild[]): GameBuild[] {
  const versions = builds.filter((build) => !build.isEditor)
  const editors = builds.filter((build) => build.isEditor)
  const newestFirst = [...versions].sort((left, right) =>
    left.createdAt === right.createdAt ? 0 : left.createdAt < right.createdAt ? 1 : -1,
  )
  return [...newestFirst, ...editors]
}
