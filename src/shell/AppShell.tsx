import { useState } from 'react'
import { appPath } from '../appPath'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { QaNoticeBell } from '../qa/QaNoticeBell'
import { QuestionNotifications } from '../qa/evaluation/QuestionNotifications'
import { ThemeToggle } from '../ThemeToggle'

/**
 * The signed-in chrome: brand, connection state, and the user menu. Everything
 * behind the login boundary renders inside this shell's outlet.
 */
export function AppShell() {
  const auth = useAuth()
  const { t } = useI18n()
  const [mainNode, setMainNode] = useState<HTMLElement | null>(null)

  if (auth.status !== 'authenticated') {
    // AuthProvider only ever mounts this subtree for an authenticated user; the
    // guard exists so the type narrows, not because this state is reachable.
    return null
  }

  // The server sorts identities with the most recently used provider first, so
  // the first entry is what the shell should represent the signed-in user with.
  const primaryIdentity = auth.user.identities[0] ?? null

  return (
    <div className="app-shell">
      <QuestionNotifications userId={auth.user.id} />
      <header className="top-bar">
        <Link className="brand" to="/projects" aria-label={t.common.shell.brandHomeLabel}>
          <span className="brand-mark" aria-hidden="true">
            <img src={appPath('/artel-mark.svg')} alt="" />
          </span>
          <span>ARTEL</span>
          <span className="product-name">Replay Studio</span>
        </Link>
        <div className="top-bar-actions">
          {/* The guide is not tied to a project, so it sits in the chrome every
              signed-in page shares rather than in one project's rail. */}
          <NavLink className="top-bar-link" to="/setup">
            {t.common.shell.setupGuide}
          </NavLink>
          {/* The admin screens are hidden from everyone but an ADMIN; the server still decides what each API returns. */}
          {auth.user.platformRole === 'ADMIN' && (
            <NavLink className="top-bar-link" to="/admin">
              {t.admin.shellLink}
            </NavLink>
          )}
          {/* QA 끝 알림을 모아 둔다(ARTEL-1255). 프로젝트를 가리지 않아 모든 화면이 같이 쓰는 상단바에 둔다. */}
          <QaNoticeBell />
          <ThemeToggle
            toDarkLabel={t.common.shell.switchToDark}
            toLightLabel={t.common.shell.switchToLight}
          />
          {/* 언어 고르기는 계정 설정의 환경 칸으로 옮겼다(ARTEL-1208). */}
          <div className="user-menu">
            <Link
              aria-label={t.common.shell.accountSettingsLabel}
              className="user-account-link"
              to="/account"
            >
              {primaryIdentity?.avatarUrl ? (
                <img className="user-avatar" src={primaryIdentity.avatarUrl} alt="" />
              ) : (
                <span className="user-avatar user-avatar--fallback" aria-hidden="true">
                  {auth.user.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="user-name">{auth.user.displayName}</span>
            </Link>
            <button className="logout-button" type="button" onClick={() => void auth.logout()}>
              {t.common.shell.signOut}
            </button>
          </div>
        </div>
      </header>

      {/* 페이지 스크롤도 서비스 막대(ARTEL-1208). 브라우저 막대는 숨긴다. */}
      <div className="scroll-frame app-main-frame">
        <main className="workspace" ref={setMainNode}>
          <Outlet />
        </main>
        <EdgeScrollbar label={t.common.shell.pageScroll} scroller={mainNode} side="right" />
      </div>
    </div>
  )
}
