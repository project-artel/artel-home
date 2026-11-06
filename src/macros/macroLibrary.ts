import type { Lookup } from '../projectAgent/specs/lookup'
import { selectBuild } from '../projects/gameBuilds'
import type { GameBuild } from '../projects/gameTypes'
import type { DeveloperMacroSummary } from './developerMacroTypes'
import type { MacroSummary } from './macroTypes'

/*
 * Macro 라이브러리의 목록 규칙 (ARTEL-1102).
 *
 * 왼쪽 `버전` 목록에서 고르는 것은 둘 중 하나다. build 하나를 고르면 그 build 에 tool loop
 * agent 가 저장한 agent macro 를 보고, 맨 아래 `개발자 macro (MCP)` 줄을 고르면 개발자가 MCP
 * 로 프로젝트에 등록한 developer macro 전부를 본다. 케이스 라이브러리의 `버전 없음` 줄과 같은
 * 자리다. 한 화면에는 한 출처만 선다.
 *
 * 여기에는 그 화면을 만드는 순수 함수만 있다 — 고른 것 읽기, 줄 만들기, 검색, 주소 parameter,
 * 버전 목록 순서.
 */

/**
 * `build` parameter 가 developer macro 줄을 가리킬 때의 값.
 *
 * build id 는 숫자로 된 문자열(`GameBuild.id`, 서버의 `Long`)이라 이 값과 겹치지 않는다.
 * 케이스 라이브러리가 `버전 없음` 에 `unversioned` 를 쓰는 것과 같은 방식이다.
 */
export const DEVELOPER_VIEW = 'developer'

/** 라이브러리가 지금 보여 주는 것. */
export type MacroView = { kind: 'build'; build: GameBuild } | { kind: 'developer' }

/**
 * 주소의 `build` 를 화면으로. `developer` 면 developer macro, 아니면 `selectBuild` 가 고른
 * build 다(없거나 모르는 id 면 최신 build). build 가 하나도 없으면 `null` 이다.
 */
export function resolveMacroView(builds: GameBuild[], requestedBuild: string | null): MacroView | null {
  if (requestedBuild === DEVELOPER_VIEW) return { kind: 'developer' }
  const build = selectBuild(builds, requestedBuild)
  return build === undefined ? null : { kind: 'build', build }
}

/**
 * 비교 기준이 되는 `현재` build. 케이스 라이브러리처럼 최신 game version build 이고, editor
 * build 는 될 수 없다. editor build 만 있는 프로젝트에는 없다.
 */
export function latestVersionBuild(builds: GameBuild[]): GameBuild | undefined {
  const newest = selectBuild(builds, null)
  return newest !== undefined && !newest.isEditor ? newest : undefined
}

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
 * `버전` 목록에서 `build`(build id 또는 `developer`)를 골랐을 때의 다음 주소.
 *
 * 연 macro 는 새 화면에서도 뜻이 있을 때만 남는다. developer macro 는 developer macro 화면에서만,
 * agent macro 는 같은 build 를 다시 골랐을 때만 남는다 — 다른 build 의 agent macro id 는 그
 * build 에 없는 id 가 되어 곧바로 지워지거나, 더 나쁘게는 엉뚱한 macro 를 연다.
 *
 * `setSearchParams` 의 함수형 updater 안에서 부르도록 직전 주소를 받고 새 객체를 돌려준다.
 */
export function selectViewParams(previous: URLSearchParams, buildParam: string): URLSearchParams {
  const next = new URLSearchParams(previous)
  const selection = parseMacroParam(previous.get('macro'))
  const keepsSelection =
    selection !== null &&
    (selection.origin === 'developer'
      ? buildParam === DEVELOPER_VIEW
      : buildParam !== DEVELOPER_VIEW && previous.get('build') === buildParam)
  next.set('build', buildParam)
  if (!keepsSelection) next.delete('macro')
  return next
}

export function agentLibraryItems(macros: MacroSummary[]): LibraryMacro[] {
  return macros.map((macro) => ({
    origin: 'agent',
    key: formatMacroParam({ origin: 'agent', id: macro.id }),
    name: macro.name,
    macro,
  }))
}

export function developerLibraryItems(macros: DeveloperMacroSummary[]): LibraryMacro[] {
  return macros.map((macro) => ({
    origin: 'developer',
    key: formatMacroParam({ origin: 'developer', name: macro.name }),
    name: macro.name,
    macro,
  }))
}

/** agent 가 이름이나 key 로 macro 를 고를 때 쓰는 대조 대상. key(`agent:7`)와 이름이 모두 정확히 맞는 key 다. */
export function macroLookups(items: LibraryMacro[]): Lookup<LibraryMacro>[] {
  return items.map((item) => ({ entry: item, keys: [item.key, item.name], title: item.name }))
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
