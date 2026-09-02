import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { ISSUE_SEVERITIES, type Issue } from '../../issues/issueTypes'
import { SeverityTag } from '../../issues/SeverityTag'
import { qaRunPath, type QaTry } from '../../qa/qaTypes'
import type { TestCaseCoverage } from '../../testCases/testCaseTypes'
import { formatDate } from '../formatters'
import { ProjectUsagePanel } from '../../usage/ProjectUsagePanel'
import { QaStatusPill } from './QaStatusPill'
import { sectionHref } from './sections'
import { useWorkspace } from './workspaceContext'

/** How many rows each summary shows before deferring to its section. */
const PREVIEW = 4

/**
 * What a project looks like right now, above everything it contains.
 *
 * Four counts answer the questions someone opens the project to ask — how much
 * is set up, how much has run, what is broken, is a game connected — and each
 * one is a link into the section that explains it. The summaries below repeat
 * the newest few rows so the common case, "show me the last failure", needs no
 * navigation at all.
 */
export function DashboardSection() {
  const { t } = useI18n()
  const {
    builds,
    coverage,
    documents,
    extrasStatus,
    instances,
    openIssues,
    project,
    projectId,
    runs,
    tries,
  } = useWorkspace()
  const w = t.projects.workspace

  const settled = extrasStatus === 'ready'
  const failedCount = tries.filter((item) => item.status === 'FAILED').length
  const connected = instances.filter((instance) => instance.connected).length
  const worst = worstSeverity(openIssues)
  // The list endpoint does not promise an order, so "latest" is computed here
  // rather than read off the first row.
  const newestRuns = [...runs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )
  const newestRun = newestRuns[0] ?? null
  const defaultBuild = builds[0] ?? null

  return (
    <div className="dashboard">
      <div className="stat-row">
        <StatTile
          href={sectionHref(projectId, 'test-runs')}
          label={w.nav.testRuns}
          sub={
            newestRun === null
              ? w.stats.noRuns
              : w.stats.latest(formatDate(newestRun.createdAt))
          }
          value={settled ? String(runs.length) : '—'}
        />
        <StatTile
          href={sectionHref(projectId, 'qa-history')}
          label={w.nav.qaHistory}
          sub={failedCount > 0 ? w.stats.failed(failedCount) : w.stats.noFailures}
          tone={failedCount > 0 ? 'critical' : undefined}
          value={settled ? String(tries.length) : '—'}
        />
        <StatTile
          href={sectionHref(projectId, 'issues')}
          label={w.stats.openIssues}
          sub={
            worst === null
              ? w.stats.allClear
              : `${t.issues.severityLabels[worst.severity]} ${worst.count}`
          }
          tone={worst === null ? undefined : 'warning'}
          value={settled ? String(openIssues.length) : '—'}
        />
        <StatTile
          href={sectionHref(projectId, 'test-runs')}
          label={w.stats.coverage}
          sub={
            coverage.total === 0
              ? w.stats.noCases
              : coverage.unauthored === 0
                ? w.stats.allCovered
                : w.stats.uncoveredLeft(coverage.unauthored)
          }
          tone={coverage.total > 0 && coverage.unauthored > 0 ? 'warning' : undefined}
          value={settled ? `${coverage.authored}/${coverage.total}` : '—'}
        />
        <StatTile
          href={sectionHref(projectId, 'qa')}
          label={t.projects.instances.title}
          sub={
            instances.length === 0
              ? t.projects.instances.notConnected
              : w.stats.connected(connected, instances.length)
          }
          value={String(instances.length)}
        />
      </div>

      {/* 타일 아래, 요약 목록 위다. 타일은 "무엇이 몇 개 있나"이고 아래 목록은 "최근에 무엇이
          있었나"인데, 지출은 그 둘 사이의 "그걸 하는 데 얼마가 들었나"라 자리가 여기다. */}
      <ProjectUsagePanel projectId={projectId} />

      <div className="dashboard-columns">
        <div className="dashboard-main">
          <SummaryPanel
            href={sectionHref(projectId, 'qa-history')}
            title={w.recentQa}
          >
            {!settled ? (
              <p className="panel-empty panel-empty--inset">{t.qa.panel.loading}</p>
            ) : tries.length === 0 ? (
              <p className="panel-empty panel-empty--inset">{t.qa.panel.empty}</p>
            ) : (
              <ul className="summary-list">
                {tries.slice(0, PREVIEW).map((qaTry) => (
                  <li className="summary-row summary-row--qa" key={qaTry.id}>
                    {qaTry.qaRunId === null ? (
                      <span className="table-link table-link--muted mono" translate="no">
                        #{qaTry.id}
                      </span>
                    ) : (
                      <Link
                        className="table-link mono"
                        to={qaRunPath(projectId, qaTry.qaRunId, qaTry.id)}
                        translate="no"
                      >
                        #{qaTry.id}
                      </Link>
                    )}
                    <QaStatusPill status={qaTry.status} />
                    <span className="summary-meta">{startedLabel(qaTry, t.qa.history.notStarted)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SummaryPanel>

          <SummaryPanel href={sectionHref(projectId, 'issues')} title={w.stats.openIssues}>
            {!settled ? (
              <p className="panel-empty panel-empty--inset">{t.issues.list.loading}</p>
            ) : openIssues.length === 0 ? (
              <p className="panel-empty panel-empty--inset">{w.noOpenIssues}</p>
            ) : (
              <ul className="summary-list">
                {openIssues.slice(0, PREVIEW).map((issue) => (
                  <li className="summary-row summary-row--issue" key={issue.id}>
                    <SeverityTag severity={issue.severity} />
                    <span className="summary-title">{issue.title}</span>
                    {issue.qaRunId === null ? (
                      <span className="table-link table-link--muted mono" translate="no">
                        #{issue.qaTryId}
                      </span>
                    ) : (
                      <Link
                        className="table-link mono"
                        to={qaRunPath(projectId, issue.qaRunId, issue.qaTryId)}
                        translate="no"
                      >
                        #{issue.qaTryId}
                      </Link>
                    )}
                    <span className="summary-meta">{formatDate(issue.reportedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SummaryPanel>

          <UncoveredPanel coverage={coverage} projectId={projectId} settled={settled} />

          <SummaryPanel href={sectionHref(projectId, 'test-runs')} title={w.nav.testRuns}>
            {!settled ? (
              <p className="panel-empty panel-empty--inset">{t.scenarios.runList.loading}</p>
            ) : runs.length === 0 ? (
              <p className="panel-empty panel-empty--inset">{t.scenarios.runList.empty}</p>
            ) : (
              <div className="run-card-grid">
                {newestRuns.slice(0, 3).map((run) => (
                  <Link
                    className="run-card"
                    key={run.id}
                    to={`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(run.id)}/edit`}
                  >
                    <span className="run-card-name">
                      {run.name.length > 0 ? run.name : t.scenarios.runList.untitled}
                    </span>
                    <span className="run-card-meta">
                      {t.scenarios.runList.created(formatDate(run.createdAt))}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </SummaryPanel>
        </div>

        <div className="dashboard-side">
          <aside className="mini-panel">
            <div className="mini-panel-head">
              <h2>{t.projects.detail.informationTitle}</h2>
              <Link className="section-more" to={sectionHref(projectId, 'settings')}>
                {t.projects.shared.edit}
              </Link>
            </div>
            <dl className="mini-fields">
              <dt>{t.projects.shared.nameLabel}</dt>
              <dd>{project.name}</dd>
              <dt>{t.projects.form.genreLabel}</dt>
              <dd>{t.projects.genreLabels[project.genre]}</dd>
              <dt>{t.projects.form.descriptionLabel}</dt>
              <dd>
                {project.description !== null && project.description.length > 0 ? (
                  project.description
                ) : (
                  <span className="detail-empty">{t.projects.detail.noDescription}</span>
                )}
              </dd>
              <dt>{t.projects.detail.createdField}</dt>
              <dd className="mono">{formatDate(project.createdAt)}</dd>
            </dl>
          </aside>

          <aside className="mini-panel">
            <div className="mini-panel-head">
              <h2>{t.projects.builds.title}</h2>
              <Link className="section-more" to={sectionHref(projectId, 'qa')}>
                {w.seeAll}
              </Link>
            </div>
            {defaultBuild === null ? (
              <p className="mini-empty">{w.noBuilds}</p>
            ) : (
              <div className="mini-line">
                <span className="mono">{defaultBuild.version}</span>
                <span className="mini-meta">{formatDate(defaultBuild.createdAt)}</span>
              </div>
            )}
          </aside>

          <aside className="mini-panel">
            <div className="mini-panel-head">
              <h2>{t.projects.instances.title}</h2>
              <Link className="section-more" to={sectionHref(projectId, 'qa')}>
                {t.qa.panel.runButton}
              </Link>
            </div>
            {instances.length === 0 ? (
              <p className="mini-empty">{w.noInstances}</p>
            ) : (
              <ul className="mini-list">
                {instances.slice(0, 3).map((instance) => (
                  <li className="mini-line" key={instance.id}>
                    <span
                      aria-hidden="true"
                      className={
                        instance.connected ? 'status-dot status-dot--connected' : 'status-dot'
                      }
                    />
                    <span className="mini-name">{instance.name}</span>
                    <span className="mini-meta">
                      {instance.connected
                        ? t.projects.instances.connected
                        : t.projects.instances.notConnected}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <aside className="mini-panel">
            <div className="mini-panel-head">
              <h2>{t.projects.documents.title}</h2>
              <Link className="section-more" to={sectionHref(projectId, 'documents')}>
                {w.seeAll}
              </Link>
            </div>
            {documents.length === 0 ? (
              <p className="mini-empty">{t.projects.documents.empty}</p>
            ) : (
              <div className="mini-line">
                <span className="mono">v{documents[0].version}</span>
                <span className="mini-name">{documents[0].fileName}</span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

/**
 * What no scenario has reached yet, by scene.
 *
 * Scenes rather than ids: a case number means nothing to the person reading and
 * is not shown anywhere else in the product. The count beside each scene is what
 * turns "68 left" into something to actually do next.
 *
 * The verification line sits under the heading rather than merged into the same
 * number, because "authored but never run" and "ran and broke" are different work.
 *
 * Each scene links into a fresh run with the request pre-filled — not sent. The
 * proposal is the user's to edit, and an auto-sent message would be the product
 * deciding what they asked for.
 */
function UncoveredPanel({
  coverage,
  projectId,
  settled,
}: {
  coverage: TestCaseCoverage
  projectId: string
  settled: boolean
}) {
  const { t } = useI18n()
  const u = t.projects.workspace.uncovered

  return (
    <section className="panel panel--flush">
      <header className="summary-head">
        <h2>{u.title}</h2>
        {coverage.total > 0 && (
          <span className="summary-meta">
            {u.verification(coverage.verified, coverage.draft, coverage.broken)}
          </span>
        )}
      </header>
      {!settled ? (
        <p className="panel-empty panel-empty--inset">{t.qa.panel.loading}</p>
      ) : coverage.uncoveredScenes.length === 0 ? (
        <p className="panel-empty panel-empty--inset">{u.empty}</p>
      ) : (
        <ul className="summary-list">
          {coverage.uncoveredScenes.map((entry) => (
            <li className="summary-row summary-row--uncovered" key={entry.scene}>
              {/* 칩이 아니라 글자다. SceneChip의 `cat-chip`은 .scenario-studio / .run-map
                  안에서만 스타일이 있어서 여기서는 아무것도 하지 않는다 — 쓰면 코드가
                  거짓말을 한다. 이 행은 옆의 다른 요약 행들과 같은 글자 스타일로 맞춘다. */}
              <span className="summary-title">{entry.scene}</span>
              <span className="summary-meta">{u.sceneCount(entry.count)}</span>
              <Link
                className="table-link"
                to={{
                  pathname: `/projects/${encodeURIComponent(projectId)}/test-runs`,
                  search: `?draft=${encodeURIComponent(u.requestFor(entry.scene, entry.count))}`,
                }}
              >
                {u.draftRequest}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function startedLabel(qaTry: QaTry, fallback: string): string {
  return qaTry.startedAt === null ? fallback : formatDate(qaTry.startedAt)
}

/**
 * The worst severity present among the unresolved issues, with how many share
 * it. One number beside the count says more than a total on its own: two
 * trivial issues and two blockers are not the same situation.
 */
function worstSeverity(issues: Issue[]): { severity: Issue['severity']; count: number } | null {
  for (const severity of ISSUE_SEVERITIES) {
    const count = issues.filter((issue) => issue.severity === severity).length
    if (count > 0) return { severity, count }
  }
  return null
}

function StatTile({
  href,
  label,
  sub,
  tone,
  value,
}: {
  href: string
  label: string
  sub: string
  tone?: 'critical' | 'warning'
  value: string
}) {
  return (
    <Link className="stat-tile" to={href}>
      <span className="stat-body">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </span>
      <span className={tone === undefined ? 'stat-sub' : `stat-sub stat-sub--${tone}`}>{sub}</span>
    </Link>
  )
}

function SummaryPanel({
  children,
  href,
  title,
}: {
  children: React.ReactNode
  href: string
  title: string
}) {
  const { t } = useI18n()

  return (
    <section className="panel panel--flush">
      <header className="summary-head">
        <h2>{title}</h2>
        <Link className="section-more" to={href}>
          {t.projects.workspace.seeAll}
        </Link>
      </header>
      {children}
    </section>
  )
}
