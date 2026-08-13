import { useCallback, useEffect, useState } from 'react'
import { listProjectIssues } from '../../issues/issueApi'
import type { Issue } from '../../issues/issueTypes'
import { listQaModels, listQaTries } from '../../qa/qaApi'
import type { QaModel, QaTry } from '../../qa/qaTypes'
import { listTestRuns, type TestRun } from '../../testRuns/testRunApi'
import type { ExtrasStatus } from './workspaceContext'

type Extras = {
  runs: TestRun[]
  tries: QaTry[]
  models: QaModel[]
  openIssues: Issue[]
}

const empty: Extras = { runs: [], tries: [], models: [], openIssues: [] }

/**
 * The four reads no single section owns.
 *
 * They are fetched together, once, because the dashboard needs all four at the
 * same time and each of the other sections needs one of them. Splitting them
 * per section would put the dashboard back to four staggered spinners.
 *
 * A failure is one status for the set: the retry is offered in whichever
 * section the user happens to be in, and re-runs everything. That matches how
 * `useProject` already treats its own four legs.
 */
export function useWorkspaceExtras(projectId: string) {
  const [extras, setExtras] = useState<Extras>(empty)
  const [status, setStatus] = useState<ExtrasStatus>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      listTestRuns(projectId, controller.signal),
      listQaTries(projectId, controller.signal),
      listQaModels(controller.signal),
      listProjectIssues(projectId, { status: 'OPEN' }, undefined, controller.signal),
    ])
      .then(([runs, tries, models, issues]) => {
        setExtras({ runs, tries, models, openIssues: issues.items })
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus('failed')
      })

    return () => controller.abort()
  }, [projectId, reloadToken])

  const reloadExtras = useCallback(() => {
    setStatus('loading')
    setReloadToken((token) => token + 1)
  }, [])

  /**
   * Re-reads one list in place, leaving the rest of the screen alone. Used
   * after a mutation the user just made, where blanking the whole workspace
   * back to its loading state would be a heavy answer to "did my run appear".
   */
  const refreshRuns = useCallback(
    () =>
      listTestRuns(projectId).then((runs) => {
        setExtras((previous) => ({ ...previous, runs }))
      }),
    [projectId],
  )

  /**
   * Starting a QA run adds a try and can turn an issue up later. The issue
   * list is re-read alongside so the sidebar's count does not lag behind the
   * history the user is looking at.
   */
  const refreshTries = useCallback(
    () =>
      Promise.all([
        listQaTries(projectId),
        listProjectIssues(projectId, { status: 'OPEN' }),
      ]).then(([tries, issues]) => {
        setExtras((previous) => ({ ...previous, tries, openIssues: issues.items }))
      }),
    [projectId],
  )

  return { ...extras, extrasStatus: status, reloadExtras, refreshRuns, refreshTries }
}
