import { useCallback, useEffect, useState } from 'react'
import { getGameFunctionCatalog } from './gameApi'
import type { GameFunctionCatalog } from './gameFunctions'

export type GameFunctionCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

type CatalogState = {
  /** 이 값을 읽은 요청의 token. 지금 token 과 다르면 이전 build 의 것이라 읽지 않는다. */
  source: string
  status: 'ready' | 'error'
  catalog: GameFunctionCatalog | null
}

const NO_READ = ''

/**
 * 한 build 의 cheat · behavior catalog.
 *
 * `buildId` 가 null 이면 요청을 보내지 않고 `idle` 이다. build 를 아직 고르지 않은 것은 기다리는 것이
 * 아니라서, 로딩으로 읽히면 영원히 돈다. 로딩은 effect 안에서 state 를 쓰지 않고 token 비교로 도출한다
 * (`useBuildMacros` 와 같은 방식이다).
 */
export function useGameFunctionCatalog(projectId: string, buildId: string | null) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<CatalogState>({ source: NO_READ, status: 'ready', catalog: null })
  const source = buildId === null ? NO_READ : `${projectId}/${buildId}#${reloadToken}`

  useEffect(() => {
    if (buildId === null) return undefined
    const controller = new AbortController()

    getGameFunctionCatalog(projectId, buildId, controller.signal)
      .then((catalog) => setState({ source, status: 'ready', catalog }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ source, status: 'error', catalog: null })
      })

    return () => controller.abort()
  }, [projectId, buildId, source])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  if (buildId === null) {
    return { catalog: null, status: 'idle' as GameFunctionCatalogStatus, reload }
  }
  const settled = state.source === source
  return {
    catalog: settled ? state.catalog : null,
    status: settled ? state.status : ('loading' as GameFunctionCatalogStatus),
    reload,
  }
}
