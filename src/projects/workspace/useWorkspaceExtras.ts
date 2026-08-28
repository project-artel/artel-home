import { useCallback, useEffect, useState } from 'react'
import { listProjectIssues } from '../../issues/issueApi'
import type { Issue } from '../../issues/issueTypes'
import { listQaModels, listQaTries } from '../../qa/qaApi'
import type { QaModel, QaTry } from '../../qa/qaTypes'
import { getCoverage } from '../../testCases/testCaseApi'
import type { TestCaseCoverage } from '../../testCases/testCaseTypes'
import { listTestRuns, type TestRun } from '../../testRuns/testRunApi'
import { getTrackerLink } from '../../tracker/trackerApi'
import type { TrackerLink } from '../../tracker/trackerTypes'
import type { ExtrasStatus } from './workspaceContext'

type Extras = {
  runs: TestRun[]
  tries: QaTry[]
  models: QaModel[]
  openIssues: Issue[]
  coverage: TestCaseCoverage
  trackerLink: TrackerLink | null
}

const emptyCoverage: TestCaseCoverage = {
  total: 0,
  authored: 0,
  unauthored: 0,
  verified: 0,
  draft: 0,
  broken: 0,
  uncoveredScenes: [],
}

const empty: Extras = {
  runs: [],
  tries: [],
  models: [],
  openIssues: [],
  coverage: emptyCoverage,
  trackerLink: null,
}

/**
 * The five reads no single section owns.
 *
 * They are fetched together, once, because the dashboard needs several of
 * them at the same time and every other section needs at least one.
 * Splitting them per section would put the dashboard back to staggered
 * spinners. `trackerLink` joined this set for the same reason: both
 * `SettingsSection` (owns connecting/disconnecting/editing it) and
 * `IssuesSection` (needs to know "is anything connected at all" to decide
 * whether a row shows tracker UI) need it, and reading it twice — once per
 * section — would mean the two could briefly disagree about it.
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
      getCoverage(projectId, controller.signal),
      getTrackerLink(projectId, controller.signal),
    ])
      .then(([runs, tries, models, issues, coverage, trackerLink]) => {
        setExtras({ runs, tries, models, openIssues: issues.items, coverage, trackerLink })
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
      // 커버리지를 함께 읽는다. 시나리오를 만들거나 지우면 미커버 수가 바로 달라지는데, 그
      // 숫자만 옛것으로 남으면 사용자는 방금 한 일이 반영되지 않았다고 읽는다.
      Promise.all([listTestRuns(projectId), getCoverage(projectId)]).then(([runs, coverage]) => {
        setExtras((previous) => ({ ...previous, runs, coverage }))
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

  /** Applies a server response the caller already holds, avoiding a second fetch. */
  const applyTrackerLink = useCallback((trackerLink: TrackerLink | null) => {
    setExtras((previous) => ({ ...previous, trackerLink }))
  }, [])

  return {
    ...extras,
    extrasStatus: status,
    reloadExtras,
    refreshRuns,
    refreshTries,
    applyTrackerLink,
  }
}
