import { useCallback, useEffect, useState } from 'react'
import { getBuildMacro, listBuildMacros } from './macroApi'
import type { MacroDetail, MacroSummary } from './macroTypes'

/*
 * 한 빌드의 macro 를 읽는 hook 둘 (ARTEL-941).
 *
 * 둘 다 `useKnowledgeGraph.ts` 의 token 관용구를 쓴다: 읽기마다 그 읽기를 가리키는
 * 문자열을 만들고, state 에 그 문자열을 함께 적고, 렌더에서 `state.source === source`
 * 로 "정착했는가" 를 도출한다. 로딩을 effect 안에서 `setState('loading')` 으로 쓰지
 * 않는 이유가 둘이다 — 로드마다 렌더 한 번이 더 돌고, 이 저장소의
 * `react-hooks/set-state-in-effect` lint 규칙이 그 호출을 오류로 잡는다.
 *
 * 늦게 온 응답이 새 선택을 덮는 일은 구조에서 막힌다. 응답은 자기 token 과 함께
 * 적히고, 렌더는 지금 token 의 state 만 읽으므로, 옛 token 으로 적힌 값은 읽히지
 * 않는다.
 *
 * ## `useKnowledgeItemBody` 의 캐시를 가져오지 않은 이유
 *
 * 그 hook 은 선택된 항목의 본문을 id 별로 캐시하고, 화면이 떠 있는 동안 비우지 않는다.
 * 여기서는 그 캐시가 **틀린 답을 준다.** macro 의 `source` 는 변한다 — agent 가
 * `edit_macro` 로 다시 쓰기 때문이다. 비우지 않는 캐시는 agent 가 이미 고쳐 쓴 macro 의
 * 옛 source 를 계속 보여 준다. knowledge 항목의 본문은 열려 있는 화면 밑에서 다시
 * 쓰이지 않으므로 그쪽에는 없던 문제다.
 */

export type MacroListStatus = 'loading' | 'ready' | 'error'

/** 아무 실제 읽기도 만들 수 없는 token 이라, 첫 렌더가 로딩으로 읽힌다. */
const NO_READ = ''

type ListState = {
  status: Exclude<MacroListStatus, 'loading'>
  macros: MacroSummary[]
  source: string
}

const initialListState: ListState = { status: 'ready', macros: [], source: NO_READ }

/**
 * 한 빌드에 등록된 macro 목록.
 *
 * 페이지 나눔이 없는 한 번의 읽기다. 한 빌드의 macro 는 사람이 전부 훑어보라고 있는
 * 것이고, 그 수가 한 화면을 넘길 만큼 쌓이는 것을 아직 본 적이 없다.
 */
export function useBuildMacros(projectId: string, gameBuildId: string) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<ListState>(initialListState)
  const source = `${projectId}/${gameBuildId}#${reloadToken}`

  useEffect(() => {
    const controller = new AbortController()

    listBuildMacros(projectId, gameBuildId, controller.signal)
      .then((macros) => setState({ status: 'ready', macros, source }))
      .catch((error: unknown) => {
        // abort 는 이 effect 가 교체됐다는 뜻이다. 더 새로운 읽기가 state 를 갖고
        // 있으므로 여기서 오류를 적으면 그 결과를 덮는다.
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', macros: [], source })
      })

    return () => controller.abort()
  }, [projectId, gameBuildId, source])

  const settled = state.source === source
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  /*
   * 새로고침 중에는 직전 목록이 그대로 남는다. 비우면 화면이 통째로 "불러오는 중" 으로
   * 떨어지고, 열어 둔 macro 의 선택과 source 까지 함께 사라진다 — 사용자가 누른 것은
   * 새로고침이지 닫기가 아니다.
   *
   * **빌드가 바뀔 때는 다르다.** 그때는 직전 빌드의 macro 가 이 빌드의 이름을 달고
   * 서 있게 되므로 보여서는 안 된다. 두 경우가 갈리는 자리는 여기가 아니라
   * `MacroSection` 의 `key={selectedBuild.id}` 다 — 빌드가 바뀌면 이 hook 이 통째로
   * 새로 마운트되어 state 가 초기값부터 시작한다.
   */
  return {
    macros: state.macros,
    status: settled ? state.status : ('loading' as MacroListStatus),
    reload,
  }
}

/**
 * `idle` 이 따로 있는 이유.
 *
 * 위 목록 hook 은 `projectId` 가 절대 비지 않아 effect 가 반드시 한 번은 state 를
 * 쓴다는 사실에 기대고 로딩을 도출한다. source 쪽은 그렇지 않다 — 아무 macro 도
 * 안 골랐으면 요청이 영영 나가지 않고, `settled` 가 false 로 굳어 **영원히 로딩**이
 * 된다. 고르지 않은 것은 기다리는 것이 아니므로 그 자리에 상태 하나를 더 둔다.
 */
export type MacroSourceStatus = 'idle' | 'loading' | 'ready' | 'error'

type SourceState = {
  status: Exclude<MacroSourceStatus, 'idle' | 'loading'>
  macro: MacroDetail | null
  source: string
}

const initialSourceState: SourceState = { status: 'ready', macro: null, source: NO_READ }

/**
 * 고른 macro 하나와 그 `source`.
 *
 * token 에 `gameBuildId` 가 들어간다. 빼고 키를 잡으면 빌드를 바꿔도 같은 id 를 다시
 * 읽지 않아, 다른 빌드의 source 가 이 빌드의 이름을 달고 남는다.
 */
export function useMacroSource(
  projectId: string,
  gameBuildId: string,
  macroId: string | null,
) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<SourceState>(initialSourceState)
  const source = macroId === null ? NO_READ : `${projectId}/${gameBuildId}/${macroId}#${reloadToken}`

  useEffect(() => {
    if (macroId === null) return
    const controller = new AbortController()

    getBuildMacro(projectId, gameBuildId, macroId, controller.signal)
      .then((macro) => setState({ status: 'ready', macro, source }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', macro: null, source })
      })

    return () => controller.abort()
  }, [projectId, gameBuildId, macroId, source])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  if (macroId === null) {
    return { macro: null, status: 'idle' as MacroSourceStatus, reload }
  }

  const settled = state.source === source
  return {
    macro: settled ? state.macro : null,
    status: settled ? state.status : ('loading' as MacroSourceStatus),
    reload,
  }
}
