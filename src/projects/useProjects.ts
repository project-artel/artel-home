import { useCallback, useEffect, useRef, useState } from 'react'
import { listProjects } from './projectApi'
import type { ProjectSummary } from './projectTypes'

const PAGE_SIZE = 20

type ProjectsState = {
  status: 'loading' | 'ready' | 'error'
  items: ProjectSummary[]
  total: number
}

const loadingState: ProjectsState = { status: 'loading', items: [], total: 0 }
const errorState: ProjectsState = { status: 'error', items: [], total: 0 }

/**
 * Loads the project list one page at a time.
 *
 * Pages accumulate rather than replace, so "Load more" appends. `total` comes
 * from the server and is the only thing that decides whether another page
 * exists — never the length of the last page, which looks identical on a full
 * final page and on a page that happens to be exactly `PAGE_SIZE`.
 */
export function useProjects() {
  const [state, setState] = useState<ProjectsState>(loadingState)
  const [loadingMore, setLoadingMore] = useState(false)
  const nextPage = useRef(0)

  // The first page is fetched here and the state is only ever touched from the
  // promise callbacks, matching how AuthProvider resolves the session.
  useEffect(() => {
    const controller = new AbortController()

    listProjects({ page: 0, size: PAGE_SIZE, signal: controller.signal })
      .then((result) => {
        nextPage.current = 1
        setState({ status: 'ready', items: result.items, total: result.total })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState(errorState)
      })

    return () => controller.abort()
  }, [])

  const reload = useCallback(() => {
    setState(loadingState)
    listProjects({ page: 0, size: PAGE_SIZE })
      .then((result) => {
        nextPage.current = 1
        setState({ status: 'ready', items: result.items, total: result.total })
      })
      .catch(() => setState(errorState))
  }, [])

  const loadMore = useCallback(() => {
    const page = nextPage.current
    setLoadingMore(true)

    listProjects({ page, size: PAGE_SIZE })
      .then((result) => {
        nextPage.current = page + 1
        setState((previous) => ({
          status: 'ready',
          total: result.total,
          items: [...previous.items, ...result.items],
        }))
      })
      // A failed "Load more" leaves the pages already on screen alone; the
      // button simply becomes available again.
      .catch(() => undefined)
      .finally(() => setLoadingMore(false))
  }, [])

  return {
    status: state.status,
    projects: state.items,
    total: state.total,
    hasMore: state.items.length < state.total,
    loadingMore,
    loadMore,
    reload,
  }
}
