import { useMemo } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { formatDate } from '../formatters'
import { useProject } from '../useProject'
import { ProjectNav } from './ProjectNav'
import { sectionIdFromPath } from './sections'
import { useWorkspaceExtras } from './useWorkspaceExtras'
import { WorkspaceContext, type WorkspaceValue } from './workspaceContext'

/**
 * Keyed by the project id so switching projects remounts rather than reusing
 * the previous project's loaded state.
 */
export function ProjectWorkspaceRoute() {
  const { projectId = '' } = useParams()
  return <ProjectWorkspace key={projectId} projectId={projectId} />
}

/**
 * The project's own shell: a left rail of sections, and one section at a time
 * in the space beside it.
 *
 * Everything used to render on a single scrolling page. That page grew a panel
 * per feature until the QA history alone outran the viewport, and the answer to
 * "what is the state of this project" was somewhere in the middle of it. The
 * rail splits the page by question asked; the dashboard answers the first one.
 *
 * The layout owns every read, so moving between sections is a re-render and
 * nothing else — no request, no spinner, no scroll jump back to a loading line.
 */
function ProjectWorkspace({ projectId }: { projectId: string }) {
  const {
    applyBuild,
    applyInstance,
    applyNewDocument,
    applyProject,
    builds,
    documents,
    instances,
    project,
    refreshGameState,
    reload,
    removeInstance,
    status,
  } = useProject(projectId)
  const extras = useWorkspaceExtras(projectId)
  const { t } = useI18n()
  const { pathname } = useLocation()

  const {
    extrasStatus,
    models,
    openIssues,
    refreshRuns,
    refreshTries,
    reloadExtras,
    runs,
    tries,
  } = extras

  const value = useMemo<WorkspaceValue | null>(
    () =>
      project === null
        ? null
        : {
            projectId,
            project,
            documents,
            instances,
            builds,
            runs,
            tries,
            models,
            openIssues,
            extrasStatus,
            reloadExtras,
            refreshRuns,
            refreshTries,
            refreshGameState,
            applyProject,
            applyNewDocument,
            applyInstance,
            removeInstance,
            applyBuild,
          },
    [
      applyBuild,
      applyInstance,
      applyNewDocument,
      applyProject,
      builds,
      documents,
      extrasStatus,
      instances,
      models,
      openIssues,
      project,
      projectId,
      refreshGameState,
      refreshRuns,
      refreshTries,
      reloadExtras,
      removeInstance,
      runs,
      tries,
    ],
  )

  if (status === 'loading') {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">{t.projects.detail.loading}</p>
      </section>
    )
  }

  if (status === 'missing') {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>{t.projects.detail.notFoundTitle}</h1>
          <p className="panel-message-copy">{t.projects.shared.missingCopy}</p>
          <Link className="button button--secondary" to="/projects">
            {t.projects.shared.backToProjects}
          </Link>
        </div>
      </section>
    )
  }

  if (status === 'error' || project === null || value === null) {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          <p>{t.projects.detail.loadFailed}</p>
          <button className="button button--secondary" onClick={reload} type="button">
            {t.projects.shared.retry}
          </button>
        </div>
      </section>
    )
  }

  const sectionId = sectionIdFromPath(projectId, pathname)
  // A count the user cannot trust yet is worse than no count: `null` keeps the
  // badge off the row until its read lands.
  const settled = extrasStatus === 'ready'

  return (
    <div className="project-workspace">
      <ProjectNav
        counts={{
          documents: documents.length,
          testRuns: settled ? runs.length : null,
          qaHistory: settled ? tries.length : null,
          issues: settled ? openIssues.length : null,
        }}
        genreLabel={t.projects.genreLabels[project.genre]}
        projectId={projectId}
        projectName={project.name}
      />

      <div className="workspace-body">
        <header className="section-header">
          <div className="section-heading">
            <h1>{t.projects.workspace.nav[sectionId]}</h1>
            <Link className="section-project-link" to="/projects">
              {t.projects.workspace.allProjects}
            </Link>
          </div>
          <p className="section-updated">
            {t.projects.shared.updated(formatDate(project.updatedAt))}
          </p>
        </header>

        <div className="section-content">
          <WorkspaceContext.Provider value={value}>
            <Outlet />
          </WorkspaceContext.Provider>
        </div>
      </div>
    </div>
  )
}
