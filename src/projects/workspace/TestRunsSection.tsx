import { RunListPanel } from '../../testRuns/RunListPanel'
import { useWorkspace } from './workspaceContext'

/** The run list, full width — its rows are wide and there is nothing beside it. */
export function TestRunsSection() {
  const { extrasStatus, projectId, refreshRuns, reloadExtras, runs } = useWorkspace()

  return (
    <div className="section-single">
      <RunListPanel
        onChanged={refreshRuns}
        onReload={reloadExtras}
        projectId={projectId}
        runs={runs}
        status={extrasStatus}
      />
    </div>
  )
}
