import { useCallback, useEffect, useState } from 'react'
import { listGameBuildSummaries } from '../gameApi'
import type { GameBuildSummary } from '../gameBuildSummary'

export type GameBuildSummariesStatus = 'loading' | 'ready' | 'failed'

type SummariesState = {
  /** 이 값을 읽은 요청의 token. 지금 token 과 다르면 앞 요청의 것이라 읽지 않는다. */
  source: string
  status: 'ready' | 'failed'
  /** `null` 은 서버에 `/summary` 가 없다는 뜻이다. 화면은 workspace 의 빌드 목록으로 대신 그린다. */
  summaries: GameBuildSummary[] | null
}

/**
 * 게임 빌드 섹션의 요약 목록. 섹션이 열릴 때 한 번 읽는다.
 *
 * workspace 가 아니라 섹션이 읽는 이유: 이 응답은 이 섹션만 쓰고, QA run 수처럼 다른 화면의 동작으로 바뀌는
 * 값이 섞여 있어 workspace 에 두면 언제 다시 읽을지를 모든 화면이 알아야 한다.
 * 로딩은 effect 안에서 state 를 쓰지 않고 token 비교로 도출한다(`useGameFunctionCatalog` 와 같은 방식).
 */
export function useGameBuildSummaries(projectId: string) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<SummariesState | null>(null)
  const source = `${projectId}#${reloadToken}`

  useEffect(() => {
    const controller = new AbortController()

    listGameBuildSummaries(projectId, controller.signal)
      .then((summaries) => {
        if (!controller.signal.aborted) setState({ source, status: 'ready', summaries })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ source, status: 'failed', summaries: null })
      })

    return () => controller.abort()
  }, [projectId, source])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  if (state === null || state.source !== source) {
    return { status: 'loading' as GameBuildSummariesStatus, summaries: null, reload }
  }
  return { status: state.status as GameBuildSummariesStatus, summaries: state.summaries, reload }
}
