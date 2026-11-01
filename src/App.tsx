import { lazy, useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { appBasename } from './appPath'
import { AccountSettingsPage } from './account/AccountSettingsPage'
import { AdminLayout } from './admin/AdminLayout'
import { RequireAdmin } from './admin/RequireAdmin'
import { LoginPage } from './LoginPage'
import { NotFoundPage } from './NotFoundPage'
import { useAuth } from './auth/useAuth'
import { ForcePasswordChangePage } from './auth/ForcePasswordChangePage'
import { SdkLoginPage } from './auth/SdkLoginPage'
import { resumeSdkLogin, SDK_LOGIN_PATH } from './auth/sdkLoginRequest'
import { ContentMapRedirect } from './contentMap/ContentMapPage'
import { ContentMapSection } from './contentMap/ContentMapSection'
import { useI18n } from './i18n/useI18n'
import { McpConnectPage } from './mcp/McpConnectPage'
import { MCP_CONNECT_PATH, resumeMcpConnect } from './mcp/mcpConnectRequest'
import { KnowledgeSection } from './knowledge/KnowledgeGraphPage'
import { MacroSection } from './macros/MacroSection'
import { BuildPerformanceRoute } from './performance/BuildPerformancePage'
import { PerformanceSection } from './performance/PerformanceSection'
import { RunPerformanceRoute } from './performance/RunPerformancePage'
import { QaVerdictsSection } from './qa/verdicts/QaVerdictsSection'
import { GameInstanceDetailRoute } from './projects/GameInstanceDetailPage'
import { ProjectListPage } from './projects/ProjectListPage'
import { SetupPage } from './projects/SetupPage'
import { DashboardSection } from './projects/workspace/DashboardSection'
import { DocumentsSection } from './projects/workspace/DocumentsSection'
import { IssuesSection } from './projects/workspace/IssuesSection'
import { MembersSection } from './projects/workspace/MembersSection'
import { UsageSection } from './usage/UsageSection'
import { ProjectWorkspaceRoute } from './projects/workspace/ProjectWorkspace'
import { QaHistorySection } from './projects/workspace/QaHistorySection'
import { GameBuildsSection } from './projects/workspace/GameBuildsSection'
import { QaSection } from './projects/workspace/QaSection'
import { SettingsSection } from './projects/workspace/SettingsSection'
import { SetupSection } from './projects/workspace/SetupSection'
import { TestCasesSection } from './projects/workspace/TestCasesSection'
import { TestRunsSection } from './projects/workspace/TestRunsSection'
import { QaRunRoute } from './qa/QaRunPage'
import { AppShell } from './shell/AppShell'
import { RunEditRoute } from './testRuns/RunEditPage'
import { RunMapRoute } from './testRuns/RunMapPage'
import { TestScenarioRoute } from './testScenarios/TestScenarioPage'

// The admin screens load on first visit. See `AdminLayout`.
const AdminQaPage = lazy(() => import('./admin/qa/QaPage'))
const AdminUsagePage = lazy(() => import('./admin/usage/UsagePage'))
const AdminKnowledgePage = lazy(() => import('./admin/knowledge/KnowledgePage'))
const AdminGraphPage = lazy(() => import('./admin/graph/GraphPage'))
const AdminLabelsPage = lazy(() => import('./admin/labels/LabelsPage'))
const AdminUsersPage = lazy(() => import('./admin/settings/UsersPage'))
const AdminSettingsPage = lazy(() => import('./admin/settings/SettingsPage'))

export function App() {
  const auth = useAuth()
  const { t, setLocale } = useI18n()

  // The account's stored language wins over this browser's remembered one, but
  // only once per signed-in user: re-applying it on every render would fight a
  // switch the user just made locally while the server write is in flight.
  const localeSyncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (auth.status !== 'authenticated') {
      localeSyncedFor.current = null
      return
    }
    if (localeSyncedFor.current === auth.user.id) return
    localeSyncedFor.current = auth.user.id
    if (auth.user.locale !== null) setLocale(auth.user.locale)
  }, [auth, setLocale])

  // A sign-in started from the SDK relay page lands back here, at the console
  // root, because that is the only address the server's OAuth handler redirects
  // to. Replaying the parked request is what closes that gap.
  // `/mcp/connect` 도 같은 사정이라 여기서 다시 연다. 둘 다 남아 있으면 MCP 쪽 하나만 연다 —
  // 둘 다 `location.replace` 라 연이어 부르면 뒤의 것이 앞의 것을 덮는다.
  useEffect(() => {
    if (auth.status !== 'authenticated' || auth.user.mustChangePassword) return
    const { pathname } = window.location
    if (pathname === SDK_LOGIN_PATH || pathname === MCP_CONNECT_PATH) return
    if (resumeMcpConnect()) return
    resumeSdkLogin()
  }, [auth])

  // A forced password change outranks every route, the SDK relay page
  // included: the server refuses everything else until it is done.
  if (auth.status === 'authenticated' && auth.user.mustChangePassword) {
    return <ForcePasswordChangePage />
  }

  // Matched ahead of the login boundary below: the SDK opens this page in a
  // browser that may have no session, and the routed subtree only mounts once
  // there is one.
  if (window.location.pathname === SDK_LOGIN_PATH) {
    return <SdkLoginPage />
  }

  // SDK relay page 와 같은 이유로 로그인 경계보다 앞에서 고른다. 로그인 화면을 거쳐 같은 주소로
  // 돌아와야 한다.
  if (window.location.pathname === MCP_CONNECT_PATH) {
    return <McpConnectPage />
  }

  if (auth.status === 'loading') {
    return (
      <main className="session-loading" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        {t.common.session.checking}
      </main>
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'error') {
    return <LoginPage serviceUnavailable={auth.status === 'error'} />
  }

  // Only the authenticated subtree is routed. The login boundary above stays a
  // plain render, so a routing fault can never strand a signed-out user.
  return (
    <BrowserRouter basename={appBasename}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate replace to="/projects" />} />
          <Route path="/account" element={<AccountSettingsPage />} />
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/setup" element={<SetupPage />} />
          {/* Only an ADMIN gets past RequireAdmin; everyone else sees the not-found page. */}
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate replace to="qa" />} />
            <Route path="qa" element={<AdminQaPage />} />
            <Route path="usage" element={<AdminUsagePage />} />
            <Route path="knowledge" element={<AdminKnowledgePage />} />
            <Route path="graph" element={<AdminGraphPage />} />
            <Route path="labels" element={<AdminLabelsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
          {/* One project, split by question asked. The layout loads the
              project once and keeps it mounted, so moving between sections
              costs a re-render and no request. */}
          <Route element={<ProjectWorkspaceRoute />} path="/projects/:projectId">
            <Route index element={<DashboardSection />} />
            {/* 전체 챗은 같은 session을 유지하도록 workspace에서 표시한다. */}
            <Route path="chat" element={null} />
            <Route path="documents" element={<DocumentsSection />} />
            <Route path="test-cases" element={<TestCasesSection />} />
            <Route path="test-runs" element={<TestRunsSection />} />
            <Route path="qa" element={<QaSection />} />
            <Route path="qa-history" element={<QaHistorySection />} />
            {/* 빌드 상세는 `?build=` 로 연다. 밖의 `/game-builds/:buildId/performance` · `content-map` 은 segment 가
                더 많은 별개 경로라 이 섹션과 겹치지 않는다. */}
            <Route path="game-builds" element={<GameBuildsSection />} />
            <Route path="qa-history/:qaRunId" element={<QaVerdictsSection />} />
            <Route path="content-map" element={<ContentMapSection />} />
            <Route path="macros" element={<MacroSection />} />
            <Route path="performance" element={<PerformanceSection />} />
            <Route path="issues" element={<IssuesSection />} />
            <Route path="knowledge" element={<KnowledgeSection />} />
            <Route path="setup" element={<SetupSection />} />
            <Route path="usage" element={<UsageSection />} />
            <Route path="members" element={<MembersSection />} />
            <Route path="settings" element={<SettingsSection />} />
            {/* The working screens render beside the rail too, but without the
                section heading: each brings its own header and back link, and
                a timeline, a run map, and a QA console fill the slot instead
                of scrolling inside `.section-content`. */}
            <Route path="instances/:instanceId" element={<GameInstanceDetailRoute />} />
            <Route path="test-scenarios/:testScenarioId" element={<TestScenarioRoute />} />
            <Route path="test-runs/:runId" element={<RunMapRoute />} />
            <Route path="test-runs/:runId/edit" element={<RunEditRoute />} />
            <Route path="qa-runs/:qaRunId" element={<QaRunRoute />} />
            <Route path="qa-runs/:qaRunId/performance" element={<RunPerformanceRoute />} />
            <Route path="game-builds/:buildId/performance" element={<BuildPerformanceRoute />} />
            {/* 프로젝트 안의 없는 경로. 비워 두면 레일만 남고 본문이 빈다(ARTEL-1162). */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          {/* 콘텐츠 맵 화면은 작업공간 안에 하나뿐이다. 빌드 패널의 링크와 밖에서 붙여 넣은
              주소가 계속 살아 있도록, 옛 경로는 그 하나로 넘긴다. */}
          <Route path="/projects/:projectId/game-builds/:buildId/content-map" element={<ContentMapRedirect />} />
          {/* The server's failed-callback redirect lands on /login. A user who
              is already signed in has nothing to do there, so send them on. */}
          <Route path="/login" element={<Navigate replace to="/projects" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
