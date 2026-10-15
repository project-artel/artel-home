import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import './admin.css'
import './shared/dashboard.css'
import { InfoHint } from '../design-system/primitives/InfoHint'

/** The tab order. Reading screens first, then the two that run the installation. */
const ADMIN_TABS = ['qa', 'usage', 'knowledge', 'graph', 'labels', 'users', 'settings'] as const

/**
 * The frame every `/admin` screen sits in: a heading, the tab row, and the
 * screen. The console's own top bar stays above it, so the screens moved from
 * admin-page no longer carry a top bar or a theme toggle of their own.
 *
 * Each screen is a lazy route, so the console does not load about 11,000 lines
 * of admin code for people who never open it.
 */
export function AdminLayout() {
  const { t } = useI18n()

  return (
    <div className="admin-console">
      <header className="admin-console__head">
        <h1 className="admin-console__title">
          {t.admin.title}
          <InfoHint>{t.admin.subtitle}</InfoHint>
        </h1>
        <nav className="admin-console__tabs" aria-label={t.admin.tabsLabel}>
          {ADMIN_TABS.map((tab) => (
            <NavLink
              key={tab}
              to={`/admin/${tab}`}
              className={({ isActive }) => (isActive ? 'control control--action' : 'control')}
            >
              {t.admin.tabs[tab]}
            </NavLink>
          ))}
        </nav>
      </header>
      <Suspense fallback={<p className="admin-console__loading">{t.admin.states.loading}</p>}>
        <Outlet />
      </Suspense>
    </div>
  )
}
