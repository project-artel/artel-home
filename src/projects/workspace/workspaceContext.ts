import { createContext, useContext } from 'react'
import type { Issue } from '../../issues/issueTypes'
import type { QaModel, QaTry } from '../../qa/qaTypes'
import type { TestCaseCoverage } from '../../testCases/testCaseTypes'
import type { TestRun } from '../../testRuns/testRunApi'
import type { TrackerLink } from '../../tracker/trackerTypes'
import type { DocumentParseStatusEvent } from '../documentEventsApi'
import type { GameBuild, GameInstance } from '../gameTypes'
import type { ProjectDetail, ProjectDocument } from '../projectTypes'

/**
 * How far the workspace's secondary reads got. The project itself has its own
 * status in `useProject` and gates the whole layout; these four are per-section
 * data that must not blank the sidebar while they load.
 */
export type ExtrasStatus = 'loading' | 'ready' | 'failed'

/**
 * Everything the project's sections read, loaded once by the layout.
 *
 * Sections used to fetch for themselves, which was fine while they all rendered
 * on one page — each read ran once. Behind a sidebar the same code refetches on
 * every visit and flashes a loading line each time, so the reads moved up here
 * and the sections became pure renderers of what the layout already holds.
 */
export type WorkspaceValue = {
  projectId: string
  project: ProjectDetail
  documents: ProjectDocument[]
  instances: GameInstance[]
  builds: GameBuild[]

  runs: TestRun[]
  tries: QaTry[]
  models: QaModel[]
  /** Unresolved issues, newest first, for the dashboard summary and its count. */
  openIssues: Issue[]
  /**
   * How much of the project's cases the scenarios reach (ARTEL-405). Read here
   * with the rest so the dashboard does not add a fifth staggered spinner, and
   * re-read after a run changes so the number never lags what the user just did.
   */
  coverage: TestCaseCoverage
  /**
   * The project's connection to an external issue tracker, or `null` when
   * none exists. Read by `SettingsSection` (which owns connecting, changing,
   * and disconnecting it) and by `IssuesSection` (which only needs to know
   * whether one exists at all, to decide whether a row shows tracker UI).
   */
  trackerLink: TrackerLink | null
  extrasStatus: ExtrasStatus

  /** Re-runs the five secondary reads after a failure. */
  reloadExtras: () => void
  /** After a run is created or deleted. */
  refreshRuns: () => Promise<void>
  /** After a QA run is started, so the history and dashboard agree with it. */
  refreshTries: () => Promise<void>
  /** Re-reads instances and builds — both move when a game launches. */
  refreshGameState: () => Promise<void>

  applyProject: (project: ProjectDetail) => void
  applyNewDocument: (document: ProjectDocument) => void
  applyRemovedDocument: (documentId: string) => void
  /** `/documents/events` 갱신 하나를 (ARTEL-760/761) 해당 문서에 반영한다. */
  applyDocumentStatus: (update: DocumentParseStatusEvent) => void
  applyInstance: (instance: GameInstance) => void
  removeInstance: (instanceId: string) => void
  applyBuild: (build: GameBuild) => void
  /** After connecting, changing, or disconnecting the tracker link. */
  applyTrackerLink: (trackerLink: TrackerLink | null) => void
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null)

/**
 * Read by every section. Throws rather than returning null so a section
 * rendered outside the layout fails at its first line instead of drawing an
 * empty screen that looks like "this project has nothing in it".
 */
export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext)

  if (!context) {
    throw new Error('useWorkspace must be used within ProjectWorkspace')
  }

  return context
}
