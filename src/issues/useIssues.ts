import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectChange } from '../live/useProjectChange'
import { usePolling } from '../live/usePolling'
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
  /** True once "load more" has appended pages, which a background read of page one must not collapse. */
  extended: boolean
}

const emptyState: IssuesState = {
  status: 'ready',
  items: [],
  nextBeforeId: null,
  hasMore: false,
  source: null,
  extended: false,
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
 *
 * With `poll` on, page one is re-read in the background. That read never flips
 * the status back to loading, a failed one keeps the rows on screen, and it
 * stands down once the reader has loaded more pages, since replacing page one
 * would drop the rows below it. The project change stream (`ISSUES`) drives the
 * re-read for `projectId`; a timer takes over only while the stream is down,
 * and is the only driver when `projectId` is null.
 */
function useIssuePages(load: Load, poll: boolean, projectId: string | null) {
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
          extended: false,
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
            extended: true,
          }
        })
      })
      // A failed "load more" leaves what is already on screen alone; the button
      // simply comes back.
      .catch(() => undefined)
      .finally(() => setLoadingMore(false))
  }, [load, settled, state.hasMore, state.nextBeforeId])

  const polling = useRef<AbortController | null>(null)
  useEffect(() => () => polling.current?.abort(), [])
  const refreshSilently = () => {
    if (!settled || state.extended || loadingMore || polling.current !== null) return
    const controller = new AbortController()
    polling.current = controller
    load(undefined, controller.signal)
      .then((page) =>
        setState((previous) => {
          // The filter changed, or more pages were loaded, while this was in flight.
          if (previous.source !== load || previous.extended) return previous
          const same =
            previous.status === 'ready' &&
            previous.hasMore === page.hasMore &&
            JSON.stringify(previous.items) === JSON.stringify(page.items)
          if (same) return previous
          return {
            status: 'ready',
            items: page.items,
            nextBeforeId: page.nextBeforeId,
            hasMore: page.hasMore,
            source: load,
            extended: false,
          }
        }),
      )
      // A failed poll leaves whatever is on screen alone.
      .catch(() => undefined)
      .finally(() => {
        if (polling.current === controller) polling.current = null
      })
  }
  const live = useProjectChange(poll ? projectId : null, 'ISSUES', refreshSilently)
  usePolling(refreshSilently, undefined, poll && !live)

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
export function useProjectIssues(
  projectId: string,
  filters: IssueFilters,
  reloadToken: number,
  poll = false,
) {
  const { status, severity, gameBuildId, testRunId, folderId, unversioned, categoryId, archived, query } = filters
  const load = useCallback(
    (beforeId?: string, signal?: AbortSignal) =>
      listProjectIssues(
        projectId,
        {
          status: status === 'ALL' ? undefined : status,
          severity: severity === 'ALL' ? undefined : severity,
          gameBuildId: gameBuildId ?? undefined,
          testRunId: testRunId ?? undefined,
          folderId: folderId ?? undefined,
          unversioned: unversioned === true,
          categoryId: categoryId ?? undefined,
          archived: archived === true,
          query: query || undefined,
        },
        beforeId,
        signal,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, status, severity, gameBuildId, testRunId, folderId, unversioned, categoryId, archived, query, reloadToken],
  )
  return useIssuePages(load, poll, projectId)
}

/**
 * What one run found. No filters: a single run's list is short by nature.
 *
 * `reloadToken` works as it does above, and matters more here — a run in flight
 * keeps filing issues while the panel is open, so this list follows the run's
 * project change stream, and polls while that stream is down.
 */
export function useQaTryIssues(qaTryId: string, reloadToken: number, projectId: string | null) {
  const load = useCallback(
    (beforeId?: string, signal?: AbortSignal) => listQaTryIssues(qaTryId, beforeId, signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qaTryId, reloadToken],
  )
  return useIssuePages(load, true, projectId)
}
