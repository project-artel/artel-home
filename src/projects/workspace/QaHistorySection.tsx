import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { QaHistoryDetail } from './QaHistoryDetail'
import { QaStatusPill } from './QaStatusPill'
import { qaRunPath, type QaTry, type QaTryStatus } from '../../qa/qaTypes'
import { formatDate, PLACEHOLDER } from '../formatters'
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
 *
 * 행을 누르면 그 자리에서 펼쳐진다(ARTEL-819). 상세 화면으로 넘어가지 않는 이유는
 * `GameBuildPanel` 과 같다 — 이 앱에 중첩 라우트 전례가 없고, route 를 새로 파면 이미 여기
 * 있는 로딩·실패 처리를 한 벌 더 만들게 된다.
 */
export function QaHistorySection() {
  const { t } = useI18n()
  const { extrasStatus, instances, projectId, reloadExtras, tries } = useWorkspace()
  const [filter, setFilter] = useState<QaTryStatus | 'ALL'>('ALL')
  // 여러 행을 함께 열어 둘 수 있다. 두 run 을 나란히 놓고 보는 것이 이 화면을 여는 이유의
  // 하나라, 하나를 열면 다른 하나가 닫히면 그 비교가 안 된다.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const filtered = filter === 'ALL' ? tries : tries.filter((item) => item.status === filter)

  // A try carries ids, not names. The instance is the one it can be joined to
  // from data the workspace already holds — a scenario's run would need a read
  // per try, which is not worth a column.
  const instanceNames = new Map(instances.map((instance) => [instance.id, instance.name]))

  function toggleExpanded(qaTryId: string) {
    setExpandedIds((previous) => {
      const next = new Set(previous)
      if (next.has(qaTryId)) next.delete(qaTryId)
      else next.add(qaTryId)
      return next
    })
  }

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
                <QaHistoryRow
                  expanded={expandedIds.has(qaTry.id)}
                  gameName={instanceNames.get(qaTry.gameInstanceId) ?? t.qa.history.unknownGame}
                  key={qaTry.id}
                  onToggle={toggleExpanded}
                  projectId={projectId}
                  qaTry={qaTry}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

/**
 * 한 run 의 요약 행과, 펼쳤을 때 그 아래 서는 상세 행.
 *
 * 캐럿이 별도 버튼인 것은 첫 칸이 이미 상세 화면으로 가는 링크를 들고 있기 때문이다. 행 전체를
 * 버튼으로 감싸면 그 링크가 버튼 안에 들어가는데, 그것은 유효한 HTML 이 아니고 키보드로도
 * 둘을 갈라 짚을 수 없다. 행 클릭은 마우스 편의로 남기고 키보드가 닿는 컨트롤은 캐럿이다.
 *
 * 상세는 펼쳐졌을 때만 마운트된다 — 접힌 행의 값은 아무도 안 보고, 접으면 언마운트되며 진행
 * 중이던 요청도 함께 취소된다.
 */
function QaHistoryRow({
  expanded,
  gameName,
  onToggle,
  projectId,
  qaTry,
}: {
  expanded: boolean
  gameName: string
  onToggle: (qaTryId: string) => void
  projectId: string
  qaTry: QaTry
}) {
  const { t } = useI18n()
  const detailId = `qa-history-detail-${qaTry.id}`

  return (
    <>
      <tr className={expanded ? 'run-row run-row--open' : 'run-row'} onClick={() => onToggle(qaTry.id)}>
        <td>
          <span className="run-row-id">
            <button
              aria-controls={detailId}
              aria-expanded={expanded}
              aria-label={
                expanded ? t.qa.history.detail.collapse(qaTry.id) : t.qa.history.detail.expand(qaTry.id)
              }
              className="run-row-toggle"
              onClick={(event) => {
                // 행에도 같은 핸들러가 달려 있어, 막지 않으면 눌렀다 바로 다시 닫힌다.
                event.stopPropagation()
                onToggle(qaTry.id)
              }}
              type="button"
            >
              <span aria-hidden="true">{expanded ? '−' : '+'}</span>
            </button>

            {qaTry.qaRunId === null ? (
              <span className="table-link table-link--muted mono" translate="no">
                #{qaTry.id}
              </span>
            ) : (
              <Link
                className="table-link mono"
                onClick={(event) => event.stopPropagation()}
                to={qaRunPath(projectId, qaTry.qaRunId, qaTry.id)}
                translate="no"
              >
                #{qaTry.id}
              </Link>
            )}
          </span>
        </td>
        <td>
          <QaStatusPill status={qaTry.status} />
        </td>
        <td className="table-meta">
          {qaTry.startedAt === null ? PLACEHOLDER : formatDate(qaTry.startedAt)}
        </td>
        <td className="table-secondary">{gameName}</td>
      </tr>

      {expanded && (
        <tr className="run-detail-row" id={detailId}>
          <td colSpan={4}>
            <QaHistoryDetail qaTryId={qaTry.id} />
          </td>
        </tr>
      )}
    </>
  )
}
