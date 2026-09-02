import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { sectionHref } from '../projects/workspace/sections'
import { UsageFigures } from './UsageFigures'
import { UsageGrass } from './UsageGrass'
import { useProjectUsage } from './useProjectUsage'

/**
 * What this project has been spending, on the dashboard.
 *
 * The graph and four numbers, and a link into the section for the breakdown by
 * feature and model. The dashboard answers "what is going on here" at a glance;
 * "which model ate the budget" is a question worth a screen of its own.
 */
export function ProjectUsagePanel({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const u = t.usage
  const { status, usage, grid, today, reload } = useProjectUsage(projectId)

  return (
    <section className="panel usage-panel" aria-labelledby="usage-panel-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="usage-panel-title">{u.panelTitle}</h2>
          <p className="usage-note">{u.panelSubtitle}</p>
        </div>
        <div className="usage-panel-actions">
          <Link className="button button--secondary button--compact" to={sectionHref(projectId, 'usage')}>
            {u.seeAll}
          </Link>
          <button
            className="button button--secondary button--compact"
            onClick={reload}
            type="button"
          >
            {u.refresh}
          </button>
        </div>
      </header>

      {status === 'loading' && <p className="panel-empty">{u.loading}</p>}

      {status === 'error' && (
        <p className="panel-empty" role="alert">
          {u.loadFailed}
        </p>
      )}

      {status === 'ready' && usage !== null && grid !== null && (
        <>
          <UsageFigures grid={grid} today={today} total={usage.total} />
          {/* 창 전체에 호출이 하나도 없으면 격자는 빈 칸 84개다. 그것을 그리는 대신 한 줄로
              말한다 — 빈 격자는 "아직 안 썼다"와 "불러오지 못했다"를 구분해 주지 않는다. */}
          {usage.total.calls === 0 ? (
            <p className="panel-empty">{u.nothingYet}</p>
          ) : (
            <UsageGrass grid={grid} zone={usage.zone} />
          )}
        </>
      )}
    </section>
  )
}
