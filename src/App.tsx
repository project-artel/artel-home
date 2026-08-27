import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { LoginPage } from './LoginPage'
import { NotFoundPage } from './NotFoundPage'
import { useAuth } from './auth/useAuth'
import { SdkLoginPage } from './auth/SdkLoginPage'
import { resumeSdkLogin, SDK_LOGIN_PATH } from './auth/sdkLoginRequest'
import { ContentMapRoute } from './contentMap/ContentMapPage'
import { ContentMapSection } from './contentMap/ContentMapSection'
import { useI18n } from './i18n/useI18n'
import { KnowledgeSection } from './knowledge/KnowledgeGraphPage'
import { BuildPerformanceRoute } from './performance/BuildPerformancePage'
import { PerformanceSection } from './performance/PerformanceSection'
import { RunPerformanceRoute } from './performance/RunPerformancePage'
import { GameInstanceDetailRoute } from './projects/GameInstanceDetailPage'
import { ProjectListPage } from './projects/ProjectListPage'
import { DashboardSection } from './projects/workspace/DashboardSection'
import { DocumentsSection } from './projects/workspace/DocumentsSection'
import { IssuesSection } from './projects/workspace/IssuesSection'
import { ProjectWorkspaceRoute } from './projects/workspace/ProjectWorkspace'
import { QaHistorySection } from './projects/workspace/QaHistorySection'
import { QaSection } from './projects/workspace/QaSection'
import { SettingsSection } from './projects/workspace/SettingsSection'
import { TestRunsSection } from './projects/workspace/TestRunsSection'
import { QaRunRoute } from './qa/QaRunPage'
import { QaTryRoute } from './qa/QaTryPage'
import { AppShell } from './shell/AppShell'
import { RunEditRoute } from './testRuns/RunEditPage'
import { RunMapRoute } from './testRuns/RunMapPage'
import { TestScenarioRoute } from './testScenarios/TestScenarioPage'

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
  useEffect(() => {
    if (auth.status !== 'authenticated') return
    if (window.location.pathname === SDK_LOGIN_PATH) return
    resumeSdkLogin()
  }, [auth.status])

  // Matched ahead of the login boundary below: the SDK opens this page in a
  // browser that may have no session, and the routed subtree only mounts once
  // there is one.
  if (window.location.pathname === SDK_LOGIN_PATH) {
    return <SdkLoginPage />
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
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate replace to="/projects" />} />
          <Route path="/projects" element={<ProjectListPage />} />
          {/* One project, split by question asked. The layout loads the
              project once and keeps it mounted, so moving between sections
              costs a re-render and no request. */}
          <Route element={<ProjectWorkspaceRoute />} path="/projects/:projectId">
            <Route index element={<DashboardSection />} />
            <Route path="documents" element={<DocumentsSection />} />
            <Route path="test-runs" element={<TestRunsSection />} />
            <Route path="qa" element={<QaSection />} />
            <Route path="qa-history" element={<QaHistorySection />} />
            <Route path="content-map" element={<ContentMapSection />} />
            <Route path="performance" element={<PerformanceSection />} />
            <Route path="issues" element={<IssuesSection />} />
            <Route path="knowledge" element={<KnowledgeSection />} />
            <Route path="settings" element={<SettingsSection />} />
          </Route>
          {/* The working screens stay outside the rail: a timeline, a run map,
              and a QA console each want the whole width. */}
          <Route
            path="/projects/:projectId/instances/:instanceId"
            element={<GameInstanceDetailRoute />}
          />
          <Route
            path="/projects/:projectId/test-scenarios/:testScenarioId"
            element={<TestScenarioRoute />}
          />
          <Route
            path="/projects/:projectId/test-runs/:runId"
            element={<RunMapRoute />}
          />
          <Route
            path="/projects/:projectId/test-runs/:runId/edit"
            element={<RunEditRoute />}
          />
          <Route
            path="/projects/:projectId/qa-runs/:qaRunId"
            element={<QaRunRoute />}
          />
          <Route path="/projects/:projectId/qa-runs/:qaRunId/performance" element={<RunPerformanceRoute />} />
          <Route path="/projects/:projectId/game-builds/:buildId/performance" element={<BuildPerformanceRoute />} />
          <Route path="/projects/:projectId/game-builds/:buildId/content-map" element={<ContentMapRoute />} />
          <Route
            path="/projects/:projectId/qa-tries/:qaTryId"
            element={<QaTryRoute />}
          />
          {/* The server's failed-callback redirect lands on /login. A user who
              is already signed in has nothing to do there, so send them on. */}
          <Route path="/login" element={<Navigate replace to="/projects" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
