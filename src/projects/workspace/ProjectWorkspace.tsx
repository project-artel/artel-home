import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { NotFoundPage } from '../../NotFoundPage'
import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { AgentChatPanel, AgentReopenButton, AgentSplitHandle } from '../../projectAgent/AgentDock'
import { AgentSessionProvider } from '../../projectAgent/chat/AgentSessionProvider'
import { DockSuppressionProvider } from '../../projectAgent/dockSuppression'
import { ActionRegistryProvider } from '../../projectAgent/registry'
import { useAgentDock } from '../../projectAgent/useAgentDock'
import { formatDate } from '../formatters'
import { versionBuilds } from '../gameBuilds'
import { useProject } from '../useProject'
import { ProjectNav } from './ProjectNav'
import { isDeepPath, isSectionPath, PROJECT_RAIL_PX, sectionIdFromPath } from './sections'
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
    reload,
    removeInstance,
    status,
  } = useProject(projectId)
  const extras = useWorkspaceExtras(projectId)
  const { t } = useI18n()
  const { pathname } = useLocation()
  // rail 을 접으면 페이지 칸이 168px 넓어질 뿐이라, 대화창 폭 상한은 펼친 rail 폭으로 계산한다.
  const dock = useAgentDock(projectId, pathname, PROJECT_RAIL_PX)
  // 페이지가 대화를 자기 칸에 직접 그리는 동안(시나리오 화면의 project 모드) dock 을 숨긴다.
  const [pageHostsChat, setPageHostsChat] = useState(false)
  const dockOpen = dock.open && !pageHostsChat

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
      <NotFoundPage copy={t.projects.shared.missingCopy} title={t.projects.detail.notFoundTitle} />
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
  // 섹션도 깊은 화면도 아닌 주소는 404 다. 섹션 머리글 없이 그 화면만 그린다.
  const deep = isDeepPath(projectId, pathname) || !isSectionPath(projectId, pathname)
  // A count the user cannot trust yet is worse than no count: `null` keeps the
  // badge off the row until its read lands.
  const settled = extrasStatus === 'ready'

  if (dock.fullPage && !dock.enabled) return <Navigate replace to={'/projects/' + encodeURIComponent(projectId)} />
  const agentHome = dock.enabled && dock.fullPage
  const workspaceClass =
    'project-workspace' +
    (dockOpen ? (agentHome ? ' has-agent-home' : ' has-agent') : dock.enabled && !pageHostsChat ? ' has-agent-closed' : '') +
    (dock.splitting ? ' is-splitting' : '')

  // 대화 session 은 대화창 밖에 둔다. 대화창을 닫아도 agent 가 하던 일을 계속한다.
  return (
    <ProjectAgentProviders enabled={dock.enabled} panelOpen={dock.open || pageHostsChat} projectId={projectId}>
    <div
      className={workspaceClass}
      style={dockOpen ? ({ '--agent-chat-w': `${dock.chatWidth}px` } as CSSProperties) : undefined}
    >
      <ProjectNav
        agentEnabled={dock.enabled}
        counts={{
          documents: documents.length,
          testCases: settled ? coverage.total : null,
          testRuns: settled ? runs.length : null,
          qaHistory: settled ? tries.length : null,
          // editor 빌드는 게임 버전이 아니라 세지 않는다. `GameBuildPanel` 의 빈 상태와 같은 기준이다.
          gameBuilds: versionBuilds(builds).length,
          issues: settled ? openIssues.length : null,
        }}
        genreLabel={t.projects.genreLabels[project.genre]}
        projectId={projectId}
        projectName={project.name}
        forceCollapsed={dock.folded && dock.viewportWidth < STUDIO_FULL_RAIL_MIN_PX}
      />

      {!agentHome && <div className="workspace-body">
        <DockSuppressionProvider onChange={setPageHostsChat}>
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
        </DockSuppressionProvider>
      </div>}

      {dockOpen && !agentHome && <AgentSplitHandle {...dock.handle} />}
      {dockOpen && <AgentChatPanel onClose={agentHome ? undefined : dock.closeChat} wide={agentHome} />}
      {dock.enabled && !dockOpen && !pageHostsChat && <AgentReopenButton onOpen={dock.openChat} />}
    </div>
    </ProjectAgentProviders>
  )
}

/**
 * 기능 flag 가 켜졌을 때만 registry 와 대화 session 을 둔다. 꺼져 있으면 강조 overlay, dev panel,
 * location effect 가 하나도 생기지 않는다. 페이지의 hook 은 provider 가 없으면 아무도 읽지 않는
 * 빈 registry 에 등록한다. flag 는 build 때 정해지므로 tree 모양이 실행 중에 바뀌지 않는다.
 */
function ProjectAgentProviders({
  enabled,
  panelOpen,
  projectId,
  children,
}: {
  enabled: boolean
  panelOpen: boolean
  projectId: string
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <ActionRegistryProvider projectId={projectId}>
      <AgentSessionProvider enabled panelOpen={panelOpen} projectId={projectId}>
        {children}
      </AgentSessionProvider>
    </ActionRegistryProvider>
  )
}
