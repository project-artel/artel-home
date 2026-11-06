import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProjectChange } from '../../live/useProjectChange'
import { usePolling } from '../../live/usePolling'
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
import { createWorkspaceRunLoader } from './workspaceRunLoader'

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
  const runLoader = useMemo(() => createWorkspaceRunLoader(
    async (signal) => {
      const [runs, coverage] = await Promise.all([listTestRuns(projectId, signal), getCoverage(projectId, signal)])
      return { runs, coverage }
    },
    (data) => setExtras((previous) => ({ ...previous, ...data })),
  ), [projectId])
  const refreshRuns = useCallback(() => runLoader.refresh(), [runLoader])
  useEffect(() => () => runLoader.cancel(), [runLoader])

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      refreshRuns(),
      listQaTries(projectId, controller.signal),
      listQaModels(controller.signal),
      listProjectIssues(projectId, { status: 'OPEN' }, undefined, controller.signal),
      getTrackerLink(projectId, controller.signal),
    ])
      .then(([, tries, models, issues, trackerLink]) => {
        if (controller.signal.aborted) return
        setExtras((previous) => ({ ...previous, tries, models, openIssues: issues.items, trackerLink }))
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus('failed')
      })

    return () => controller.abort()
  }, [projectId, reloadToken, refreshRuns])

  const reloadExtras = useCallback(() => {
    setStatus('loading')
    setReloadToken((token) => token + 1)
  }, [])

  // 이벤트마다 화면을 비우지 않아 QA에서 선택한 런과 모델을 유지한다.
  const live = useProjectChange(projectId, 'TEST_RUNS', () => { void refreshRuns().catch(() => {}) })
  usePolling(() => { void refreshRuns().catch(() => {}) }, undefined, status === 'ready' && !live)

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
