import { useCallback, useEffect, useState } from 'react'
import { getKnowledgeGraph } from './knowledgeApi'
import { KNOWLEDGE_NODE_LIMIT, type KnowledgeGraph } from './knowledgeTypes'

type LoadStatus = 'loading' | 'ready' | 'error'

type LoadedState = {
  status: Exclude<LoadStatus, 'loading'>
  graph: KnowledgeGraph | null
  /**
   * Which request produced this. State whose source is not the current one
   * belongs to a previous project or a previous refresh, which is what lets
   * "loading" be derived during render instead of written from the effect —
   * writing it there is an extra render pass on every load.
   */
  source: string
}

/** No real request can produce this, so the first render reads as loading. */
const initialState: LoadedState = { status: 'ready', graph: null, source: '' }

/**
 * One project's knowledge graph.
 *
 * A single read with no paging: the endpoint's own node budget is the limit, and
 * the point of the screen is to show the shape all at once. `reload` bumps a
 * token rather than calling the fetch again by hand, so retry and refresh take
 * the same path as the first load and cannot drift from it.
 */
export function useKnowledgeGraph(projectId: string) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<LoadedState>(initialState)
  const source = `${projectId}#${reloadToken}`

  useEffect(() => {
    const controller = new AbortController()

    getKnowledgeGraph(projectId, KNOWLEDGE_NODE_LIMIT, controller.signal)
      .then((graph) => setState({ status: 'ready', graph, source }))
      .catch((error: unknown) => {
        // An abort means this effect was replaced; a newer request owns the
        // state now and writing an error here would overwrite its result.
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', graph: null, source })
      })

    return () => controller.abort()
  }, [projectId, source])

  const settled = state.source === source
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  // The previous project's graph is not shown while the next one loads: it would
  // be a different project's knowledge under this project's heading.
  return {
    graph: settled ? state.graph : null,
    status: settled ? state.status : ('loading' as LoadStatus),
    reload,
  }
}
