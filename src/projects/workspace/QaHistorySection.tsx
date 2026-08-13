import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { QaStatusPill } from './QaStatusPill'
import type { QaTryStatus } from '../../qa/qaTypes'
import { formatDate } from '../formatters'
import { useWorkspace } from './workspaceContext'

/**
 * The filter chips, in the order a reader scans for trouble. `ALL` first
 * because it is the default; failures next because they are what the section
 * is usually opened for.
 */
const FILTERS: Array<QaTryStatus | 'ALL'> = ['ALL', 'FAILED', 'COMPLETED', 'CANCELLED']

/**
 * Every QA run this project has started.
 *
 * This is the list that used to grow without bound under the start form. As a
 * section it can be a table with a header row and a filter, which is what
 * makes a hundred rows readable rather than merely present.
 */
export function QaHistorySection() {
  const { t } = useI18n()
  const { extrasStatus, instances, projectId, reloadExtras, tries } = useWorkspace()
  const [filter, setFilter] = useState<QaTryStatus | 'ALL'>('ALL')

  const filtered = filter === 'ALL' ? tries : tries.filter((item) => item.status === filter)

  // A try carries ids, not names. The instance is the one it can be joined to
  // from data the workspace already holds — a scenario's run would need a read
  // per try, which is not worth a column.
  const instanceNames = new Map(instances.map((instance) => [instance.id, instance.name]))

  return (
    <div className="section-single">
      <div className="filter-chips" role="group" aria-label={t.qa.history.filterLabel}>
        {FILTERS.map((option) => (
          <button
            aria-pressed={filter === option}
            className={filter === option ? 'filter-chip filter-chip--on' : 'filter-chip'}
            key={option}
            onClick={() => setFilter(option)}
            type="button"
          >
            {option === 'ALL' ? t.qa.history.all : t.qa.statusLabels[option]}
          </button>
        ))}
      </div>

      <section className="panel panel--flush" aria-label={t.projects.workspace.nav.qaHistory}>
        {extrasStatus === 'loading' && <p className="panel-empty panel-empty--inset">{t.qa.panel.loading}</p>}

        {extrasStatus === 'failed' && (
          <div className="inline-error inline-error--inset" role="alert">
            <span aria-hidden="true">!</span>
            {t.qa.panel.loadFailed}
            <button
              className="button button--secondary button--compact"
              onClick={reloadExtras}
              type="button"
            >
              {t.qa.panel.retry}
            </button>
          </div>
        )}

        {extrasStatus === 'ready' && filtered.length === 0 && (
          <p className="panel-empty panel-empty--inset">
            {tries.length === 0 ? t.qa.panel.empty : t.qa.history.emptyFiltered}
          </p>
        )}

        {extrasStatus === 'ready' && filtered.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t.qa.history.runColumn}</th>
                <th scope="col">{t.qa.history.statusColumn}</th>
                <th scope="col">{t.qa.history.startedColumn}</th>
                <th scope="col">{t.qa.history.gameColumn}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((qaTry) => (
                <tr key={qaTry.id}>
                  <td>
                    <Link
                      className="table-link mono"
                      to={`/projects/${encodeURIComponent(projectId)}/qa-tries/${encodeURIComponent(qaTry.id)}`}
                      translate="no"
                    >
                      #{qaTry.id}
                    </Link>
                  </td>
                  <td>
                    <QaStatusPill status={qaTry.status} />
                  </td>
                  <td className="table-meta">
                    {qaTry.startedAt === null ? '—' : formatDate(qaTry.startedAt)}
                  </td>
                  <td className="table-secondary">
                    {instanceNames.get(qaTry.gameInstanceId) ?? t.qa.history.unknownGame}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
