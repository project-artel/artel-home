import { useCallback, useState } from 'react'
import { setIssueResolved } from './issueApi'
import type { Issue } from './issueTypes'

type Patch = (issueId: string, next: (issue: Issue) => Issue) => void

/**
 * The resolve toggle, shared by the project list and the run panel.
 *
 * The row flips before the request goes out and flips back if it fails. Waiting
 * for the server instead would make every click feel broken, and re-reading the
 * list afterwards would throw away the scroll position and the filter — the
 * server answers `204` with no body, so there is nothing to re-read for.
 *
 * The rollback is the whole reason this lives in one place: it is the half that
 * is easy to leave out, and leaving it out lets the screen and the database
 * disagree with nothing on screen saying so.
 */
export function useIssueResolution(patch: Patch) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [failedId, setFailedId] = useState<string | null>(null)

  const toggle = useCallback(
    async (issue: Issue) => {
      const resolved = issue.status !== 'RESOLVED'
      const previous = { status: issue.status, resolvedAt: issue.resolvedAt }

      setFailedId(null)
      setPending((current) => new Set(current).add(issue.id))
      patch(issue.id, (row) => ({
        ...row,
        status: resolved ? 'RESOLVED' : 'OPEN',
        // Optimistic and approximate: the server stamps its own clock. The row
        // is only ever re-read on the next load, which is when it corrects.
        resolvedAt: resolved ? new Date().toISOString() : null,
      }))

      try {
        await setIssueResolved(issue.id, resolved)
      } catch {
        patch(issue.id, (row) => ({ ...row, ...previous }))
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

  return { toggle, pending, failedId }
}
