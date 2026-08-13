import { QaTryPanel } from '../../qa/QaTryPanel'
import { GameBuildPanel } from '../GameBuildPanel'
import { GameInstancePanel } from '../GameInstancePanel'
import { useWorkspace } from './workspaceContext'

/**
 * Starting a run, and the two things a run needs to be startable.
 *
 * Instances and builds share this screen with the start form because they are
 * its preconditions: "no game is connected" and "no build has reported" are
 * both answered here, next to the control that is refusing to run.
 */
export function QaSection() {
  const {
    applyBuild,
    applyInstance,
    builds,
    extrasStatus,
    instances,
    models,
    projectId,
    refreshGameState,
    reloadExtras,
    removeInstance,
    runs,
    tries,
  } = useWorkspace()

  return (
    <div className="section-columns">
      <QaTryPanel
        instances={instances}
        models={models}
        onReload={reloadExtras}
        projectId={projectId}
        runs={runs}
        status={extrasStatus}
        tries={tries}
      />

      <div className="section-stack">
        <GameInstancePanel
          instances={instances}
          onRefresh={refreshGameState}
          onRemoved={removeInstance}
          onSaved={applyInstance}
          projectId={projectId}
        />
        <GameBuildPanel builds={builds} onSaved={applyBuild} projectId={projectId} />
      </div>
    </div>
  )
}
