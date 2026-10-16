import { useCallback, useEffect, useRef, useState } from 'react'
import { usePolling } from '../live/usePolling'
import { getDeveloperMacro, listDeveloperMacros } from './developerMacroApi'
import type { DeveloperMacroDetail, DeveloperMacroSummary } from './developerMacroTypes'
import type { MacroListStatus, MacroSourceStatus } from './useBuildMacros'

/*
 * 프로젝트의 developer macro 를 읽는 hook 둘 (ARTEL-1102).
 *
 * `useBuildMacros.ts` 의 두 hook 과 같은 token 관용구다 — 읽기마다 그 읽기를 가리키는
 * 문자열을 만들고, state 에 함께 적고, 렌더에서 `state.source === source` 로 정착했는가를
 * 도출한다. 늦게 온 응답이 새 선택을 덮지 못하는 이유와 effect 안에서 `loading` 을 쓰지
 * 않는 이유도 그쪽 머리 주석과 같다.
 *
 * 다른 점은 범위 하나다. developer macro 는 build 가 아니라 프로젝트에 속하므로 범위가
 * `projectId` 뿐이다. build 를 바꿔도 다시 읽지 않는다 — 목록은 그대로이고, 고른 build 와
 * 비교한 칩만 바뀐다.
 */

const NO_READ = ''

type ListState = {
  status: Exclude<MacroListStatus, 'loading'>
  macros: DeveloperMacroSummary[]
  source: string
  /** 이 목록이 어느 프로젝트 것인가. `useBuildMacros` 의 `scope` 와 같은 몫이다. */
  scope: string
}

const initialListState: ListState = { status: 'ready', macros: [], source: NO_READ, scope: '' }

/** 프로젝트의 developer macro 목록. 페이지 나눔이 없는 한 번의 읽기다. */
export function useDeveloperMacros(projectId: string) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<ListState>(initialListState)
  const scope = projectId
  const source = `${scope}#${reloadToken}`

  useEffect(() => {
    const controller = new AbortController()

    listDeveloperMacros(projectId, controller.signal)
      .then((macros) => setState({ status: 'ready', macros, source, scope }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // 새로고침이 실패하면 직전 목록을 들고 간다. 범위가 바뀌어 실패했으면 들고 가지
        // 않는다 — `useBuildMacros` 와 같은 판단이다.
        setState((previous) => ({
          status: 'error',
          macros: previous.scope === scope ? previous.macros : [],
          source,
          scope,
        }))
      })

    return () => controller.abort()
  }, [projectId, scope, source])

  const settled = state.source === source
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const polling = useRef<AbortController | null>(null)
  useEffect(() => () => polling.current?.abort(), [])
  usePolling(() => {
    // Not before the first read has landed, and never two reads at once.
    if (!settled || polling.current !== null) return
    const controller = new AbortController()
    polling.current = controller
    listDeveloperMacros(projectId, controller.signal)
      .then((next) =>
        setState((previous) => {
          if (previous.source !== source) return previous
          if (previous.status === 'ready' && JSON.stringify(previous.macros) === JSON.stringify(next)) {
            return previous
          }
          return { status: 'ready', macros: next, source, scope }
        }),
      )
      // A failed poll leaves the list on screen alone.
      .catch(() => undefined)
      .finally(() => {
        if (polling.current === controller) polling.current = null
      })
  })

  return {
    macros: state.scope === scope ? state.macros : [],
    status: settled ? state.status : ('loading' as MacroListStatus),
    reload,
  }
}

type SourceState = {
  status: Exclude<MacroSourceStatus, 'idle' | 'loading'>
  macro: DeveloperMacroDetail | null
  source: string
}

const initialSourceState: SourceState = { status: 'ready', macro: null, source: NO_READ }

/**
 * 고른 developer macro 하나와 그 `source`. 아무것도 안 골랐으면 `idle` 이다 — 이유는
 * `useMacroSource` 의 `MacroSourceStatus` 주석과 같다.
 *
 * 캐시하지 않는다. MCP 로 같은 이름을 다시 등록하면 `source` 가 바뀌므로, 비우지 않는
 * 캐시는 옛 원문을 보여 준다.
 */
export function useDeveloperMacroSource(projectId: string, name: string | null) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<SourceState>(initialSourceState)
  const source = name === null ? NO_READ : `${projectId}/${name}#${reloadToken}`

  useEffect(() => {
    if (name === null) return
    const controller = new AbortController()

    getDeveloperMacro(projectId, name, controller.signal)
      .then((macro) => setState({ status: 'ready', macro, source }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', macro: null, source })
      })

    return () => controller.abort()
  }, [projectId, name, source])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  if (name === null) {
    return { macro: null, status: 'idle' as MacroSourceStatus, reload }
  }

  const settled = state.source === source
  return {
    macro: settled ? state.macro : null,
    status: settled ? state.status : ('loading' as MacroSourceStatus),
    reload,
  }
}
