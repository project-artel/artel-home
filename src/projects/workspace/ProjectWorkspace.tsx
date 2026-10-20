import { useMemo, type CSSProperties } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { AgentChatPanel, AgentReopenButton, AgentSplitHandle } from '../../projectAgent/AgentDock'
import { useAgentDock } from '../../projectAgent/useAgentDock'
import { formatDate } from '../formatters'
import { useProject } from '../useProject'
import { ProjectNav } from './ProjectNav'
import { isDeepPath, PROJECT_RAIL_PX, sectionIdFromPath } from './sections'
import { useWorkspaceExtras } from './useWorkspaceExtras'
import { WorkspaceContext, type WorkspaceValue } from './workspaceContext'

/**
 * 저작 화면(런 편집, 시나리오 상세)은 시나리오 목록 280px, 단계, 대화 칸 300px 이상의 3칸이다.
 * 이보다 좁은 창에서는 216px rail 옆에 단계 칸이 200px 도 남지 않아 rail 을 48px 로 접는다.
 */
const STUDIO_FULL_RAIL_MIN_PX = 1440

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
    applyDocumentStatus,
    applyInstance,
    applyNewDocument,
    applyRemovedDocument,
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
  // rail 을 접으면 페이지 칸이 168px 넓어질 뿐이라, 대화창 폭 상한은 펼친 rail 폭으로 계산한다.
  const dock = useAgentDock(projectId, pathname, PROJECT_RAIL_PX)

  const {
    applyTrackerLink,
    coverage,
    extrasStatus,
    models,
    openIssues,
    refreshRuns,
    refreshTries,
    reloadExtras,
    runs,
    tries,
    trackerLink,
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
            coverage,
            trackerLink,
            extrasStatus,
            reloadExtras,
            refreshRuns,
            refreshTries,
            refreshGameState,
            applyProject,
            applyNewDocument,
            applyRemovedDocument,
            applyDocumentStatus,
            applyInstance,
            removeInstance,
            applyBuild,
            applyTrackerLink,
          },
    [
      applyBuild,
      applyDocumentStatus,
      applyInstance,
      applyNewDocument,
      applyRemovedDocument,
      applyProject,
      applyTrackerLink,
      builds,
      coverage,
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
      trackerLink,
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
  const deep = isDeepPath(projectId, pathname)
  // A count the user cannot trust yet is worse than no count: `null` keeps the
  // badge off the row until its read lands.
  const settled = extrasStatus === 'ready'

  // index 화면에서 대화창이 열려 있으면 페이지 칸을 숨기고 대화창이 그 자리를 넓게 쓴다.
  // DashboardSection 은 그대로 그려 두어, 720px 미만에서 대화창을 숨길 때 다시 보이게 한다.
  const agentHome = dock.open && dock.isIndex
  const workspaceClass =
    'project-workspace' +
    (dock.open ? (agentHome ? ' has-agent-home' : ' has-agent') : dock.enabled ? ' has-agent-closed' : '') +
    (dock.splitting ? ' is-splitting' : '')

  return (
    <div
      className={workspaceClass}
      style={dock.open ? ({ '--agent-chat-w': `${dock.chatWidth}px` } as CSSProperties) : undefined}
    >
      <ProjectNav
        counts={{
          documents: documents.length,
          testCases: settled ? coverage.total : null,
          testRuns: settled ? runs.length : null,
          qaHistory: settled ? tries.length : null,
          issues: settled ? openIssues.length : null,
        }}
        genreLabel={t.projects.genreLabels[project.genre]}
        projectId={projectId}
        projectName={project.name}
        forceCollapsed={dock.folded && dock.viewportWidth < STUDIO_FULL_RAIL_MIN_PX}
      />

      <div className="workspace-body">
        <WorkspaceContext.Provider value={value}>
          {deep ? (
            <div className="workspace-deep">
              <Outlet />
            </div>
          ) : (
            <>
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
                <Outlet />
              </div>
            </>
          )}
        </WorkspaceContext.Provider>
      </div>

      {dock.open && !agentHome && <AgentSplitHandle {...dock.handle} />}
      {dock.open && <AgentChatPanel onClose={dock.closeChat} wide={agentHome} />}
      {dock.enabled && !dock.open && <AgentReopenButton onOpen={dock.openChat} />}
    </div>
  )
}
