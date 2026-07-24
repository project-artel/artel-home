import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { LoginPage } from './LoginPage'
import { NotFoundPage } from './NotFoundPage'
import { useAuth } from './auth/useAuth'
import { useI18n } from './i18n/useI18n'
import { GameInstanceDetailRoute } from './projects/GameInstanceDetailPage'
import { ProjectDetailRoute } from './projects/ProjectDetailPage'
import { ProjectListPage } from './projects/ProjectListPage'
import { AppShell } from './shell/AppShell'
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
          <Route path="/projects/:projectId" element={<ProjectDetailRoute />} />
          <Route
            path="/projects/:projectId/instances/:instanceId"
            element={<GameInstanceDetailRoute />}
          />
          <Route
            path="/projects/:projectId/test-scenarios/:testScenarioId"
            element={<TestScenarioRoute />}
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
