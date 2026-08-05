import { useCallback, useEffect, useState } from 'react'
import { listProjectIssues, listQaTryIssues } from './issueApi'
import type { Issue, IssueFilters, IssuePage } from './issueTypes'

type LoadStatus = 'loading' | 'ready' | 'error'

type Load = (beforeId?: string, signal?: AbortSignal) => Promise<IssuePage>

type IssuesState = {
  status: Exclude<LoadStatus, 'loading'>
  items: Issue[]
  nextBeforeId: string | null
  hasMore: boolean
  /**
   * Which `load` produced this. A state whose source is not the current `load`
   * belongs to the previous filter, which is what lets "loading" be derived
   * during render instead of written from inside the effect.
   */
  source: Load | null
}

const emptyState: IssuesState = {
  status: 'ready',
  items: [],
  nextBeforeId: null,
  hasMore: false,
  source: null,
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * A page of issues plus the two things every caller then needs: a way to append
 * the next page, and a way to patch one row in place.
 *
 * `load` is passed in rather than branched on inside, so the project list and
 * the run panel share the paging and the optimistic patching without either one
 * knowing which endpoint the other uses.
 */
function useIssuePages(load: Load) {
  const [state, setState] = useState<IssuesState>(emptyState)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    load(undefined, controller.signal)
      .then((page) => {
        setState({
          status: 'ready',
          items: page.items,
          nextBeforeId: page.nextBeforeId,
          hasMore: page.hasMore,
          source: load,
        })
      })
      .catch((error: unknown) => {
        // An abort is this effect being replaced — a newer request owns the
        // state now, and writing an error here would overwrite its result.
        if (isAbort(error)) return
        setState({ ...emptyState, status: 'error', source: load })
      })

    return () => controller.abort()
  }, [load])

  // Stale state reads as loading rather than being cleared from the effect:
  // clearing it there is a second render pass, and until the new page lands the
  // old rows belong to filters the user has already left.
  const settled = state.source === load
  const status: LoadStatus = settled ? state.status : 'loading'

  const loadMore = useCallback(() => {
    // Read from the settled state rather than from inside a setState updater:
    // an updater must be pure, and one that fires the request would send it
    // twice the day this tree is wrapped in StrictMode.
    if (!settled || !state.hasMore || state.nextBeforeId === null) return
    setLoadingMore(true)
    load(state.nextBeforeId)
      .then((page) => {
        setState((previous) => {
          // The filter may have changed while this page was in flight. Its rows
          // belong to a list nobody is looking at any more, and appending them
          // would also hand the new list the old list's cursor.
          if (previous.source !== load) return previous
          return {
            ...previous,
            status: 'ready',
            items: [...previous.items, ...page.items],
            nextBeforeId: page.nextBeforeId,
            hasMore: page.hasMore,
          }
        })
      })
      // A failed "load more" leaves what is already on screen alone; the button
      // simply comes back.
      .catch(() => undefined)
      .finally(() => setLoadingMore(false))
  }, [load, settled, state.hasMore, state.nextBeforeId])

  const patch = useCallback((issueId: string, next: (issue: Issue) => Issue) => {
    setState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === issueId ? next(item) : item)),
    }))
  }, [])

  return {
    status,
    items: settled ? state.items : [],
    hasMore: settled && state.hasMore,
    loadingMore,
    loadMore,
    patch,
  }
}

/**
 * One project's issues, narrowed by the filters the page offers.
 *
 * `reloadToken` is not sent anywhere. Changing it makes this callback new, which
 * is what makes the effect above run again — that is how "retry" and "refresh"
 * are expressed without a second code path for re-fetching.
 */
export function useProjectIssues(projectId: string, filters: IssueFilters, reloadToken: number) {
  const { status, severity } = filters
  const load = useCallback(
    (beforeId?: string, signal?: AbortSignal) =>
      listProjectIssues(
        projectId,
        {
          status: status === 'ALL' ? undefined : status,
          severity: severity === 'ALL' ? undefined : severity,
        },
        beforeId,
        signal,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, status, severity, reloadToken],
  )
  return useIssuePages(load)
}

/**
 * What one run found. No filters: a single run's list is short by nature.
 *
 * `reloadToken` works as it does above, and matters more here — a run in flight
 * keeps filing issues while the panel is open.
 */
export function useQaTryIssues(qaTryId: string, reloadToken: number) {
  const load = useCallback(
    (beforeId?: string, signal?: AbortSignal) => listQaTryIssues(qaTryId, beforeId, signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qaTryId, reloadToken],
  )
  return useIssuePages(load)
}
