import { useCallback, useState } from 'react'
import type { Patch } from '../issues/useIssueResolution'
import type { Issue } from '../issues/issueTypes'
import { syncIssueTracker } from './trackerApi'

/**
 * Exports one issue, or retries a failed export. Mirrors `useIssueResolution`:
 * one row syncs at a time from the caller's point of view, and a failure
 * leaves the row exactly as it was — there is nothing to roll back, since
 * this hook never touches `issue.tracker` until the server actually answers.
 */
export function useTrackerSync(patch: Patch) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [failedId, setFailedId] = useState<string | null>(null)

  const sync = useCallback(
    async (issue: Issue) => {
      setFailedId(null)
      setPending((current) => new Set(current).add(issue.id))

      try {
        const tracker = await syncIssueTracker(issue.id)
        patch(issue.id, (row) => ({ ...row, tracker }))
      } catch {
        setFailedId(issue.id)
      } finally {
        setPending((current) => {
          const next = new Set(current)
          next.delete(issue.id)
          return next
        })
      }
    },
    [patch],
  )

  return { sync, pending, failedId }
}
