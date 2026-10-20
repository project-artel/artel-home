import { useCallback, useEffect, useRef, useState } from 'react'
import { usePolling } from '../live/usePolling'
import { getKnowledgeGraph } from './knowledgeApi'
import { KNOWLEDGE_NODE_LIMIT, type KnowledgeGraph } from './knowledgeTypes'

/**
 * Slower than the default 10 seconds: the read is the whole graph, and a new
 * graph restarts the force simulation, so there is little to gain from asking
 * often.
 */
const GRAPH_POLL_INTERVAL_MS = 30_000

export type KnowledgeGraphStatus = 'loading' | 'ready' | 'error'

type LoadedState = {
  status: Exclude<KnowledgeGraphStatus, 'loading'>
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
 *
 * The graph is also re-read in the background. That read never flips the status
 * back to loading, a failed one keeps the graph on screen, and an answer equal
 * to the one already held is dropped so the layout is not restarted for nothing.
 */
export function useKnowledgeGraph(projectId: string, nodeLimit = KNOWLEDGE_NODE_LIMIT) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<LoadedState>(initialState)
  const source = `${projectId}#${nodeLimit}#${reloadToken}`

  useEffect(() => {
    const controller = new AbortController()

    getKnowledgeGraph(projectId, nodeLimit, controller.signal)
      .then((graph) => setState({ status: 'ready', graph, source }))
      .catch((error: unknown) => {
        // An abort means this effect was replaced; a newer request owns the
        // state now and writing an error here would overwrite its result.
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', graph: null, source })
      })

    return () => controller.abort()
  }, [projectId, nodeLimit, source])

  const settled = state.source === source
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const polling = useRef<AbortController | null>(null)
  useEffect(() => () => polling.current?.abort(), [])
  usePolling(() => {
    // Not before the first read has landed, and never two reads at once.
    if (!settled || polling.current !== null) return
    const controller = new AbortController()
    polling.current = controller
    getKnowledgeGraph(projectId, nodeLimit, controller.signal)
      .then((next) =>
        setState((previous) => {
          if (previous.source !== source) return previous
          if (previous.status === 'ready' && JSON.stringify(previous.graph) === JSON.stringify(next)) {
            return previous
          }
          return { status: 'ready', graph: next, source }
        }),
      )
      // A failed poll leaves whatever is on screen alone.
      .catch(() => undefined)
      .finally(() => {
        if (polling.current === controller) polling.current = null
      })
  }, GRAPH_POLL_INTERVAL_MS)

  // The previous project's graph is not shown while the next one loads: it would
  // be a different project's knowledge under this project's heading.
  return {
    graph: settled ? state.graph : null,
    status: settled ? state.status : ('loading' as KnowledgeGraphStatus),
    reload,
  }
}
