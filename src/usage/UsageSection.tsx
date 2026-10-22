import { InfoHint } from '../design-system/primitives/InfoHint'
import '../layouts/screens.css'
import { useI18n } from '../i18n/useI18n'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { formatCost, totalTokens } from './format'
import { UsageFigures } from './UsageFigures'
import { UsageGrass } from './UsageGrass'
import { serviceLabel, type UsageTotals } from './usageApi'
import { useProjectUsage } from './useProjectUsage'

const counts = new Intl.NumberFormat()
const percents = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * The project's spend, in full.
 *
 * The dashboard panel shows the same graph and figures; this screen adds what
 * the spend went to. The two axes below are the same calls folded twice, so
 * each table's total equals the window total — they cannot be crossed into a
 * matrix, because one call has a feature and a model at the same time.
 */
export function UsageSection() {
  const { t } = useI18n()
  const u = t.usage
  const { projectId } = useWorkspace()
  const { status, usage, grid, today } = useProjectUsage(projectId)

  if (status === 'loading') return <p className="panel-empty">{u.loading}</p>
  if (status === 'error' || usage === null || grid === null) {
    return (
      <div className="panel-message" role="alert">
        <p>{u.loadFailed}</p>
      </div>
    )
  }

  return (
    <div className="usage-section">
      <section className="panel" aria-labelledby="usage-window-title">
        <header className="panel-header panel-header--split">
          <div>
            <h2 id="usage-window-title">
              {u.sectionTitle}
              <InfoHint>{u.sectionSubtitle(usage.zone)}</InfoHint>
            </h2>
          </div>
        </header>

        {/* 잔디는 제 폭만큼만 쓰고, 남는 옆자리에 수치를 둔다(ARTEL-1208). 전폭으로 늘리면 칸만 길고 비었다. */}
        <div className="usage-overview">
          <div className="usage-overview-grass">
            {usage.total.calls === 0 ? (
              <p className="panel-empty">{u.nothingYet}</p>
            ) : (
              <UsageGrass grid={grid} zone={usage.zone} />
            )}
          </div>
          <UsageFigures grid={grid} today={today} total={usage.total} />
        </div>
      </section>

      <div className="usage-breakdowns">

      <Breakdown
        axisLabel={u.featureAxis}
        rows={usage.byService.map((cell) => ({
          key: cell.service,
          label: serviceLabel(cell.service, u.services),
          sub: cell.service,
          totals: cell.totals,
        }))}
        note={u.embeddingNote}
        title={u.byFeature}
        total={usage.total}
      />

      <Breakdown
        axisLabel={u.modelAxis}
        rows={usage.byModel.map((cell) => ({
          key: `${cell.provider}/${cell.model}`,
          label: cell.model,
          sub: cell.provider,
          totals: cell.totals,
        }))}
        title={u.byModel}
        total={usage.total}
      />
      </div>
    </div>
  )
}

interface Row {
  key: string
  label: string
  sub: string
  totals: UsageTotals
}

/**
 * One axis, biggest first.
 *
 * Ordered by tokens rather than money: a row whose provider reported no unit
 * price would sort to the bottom on cost, hiding whichever feature actually did
 * the most work.
 */
function Breakdown({
  axisLabel,
  note,
  rows,
  title,
  total,
}: {
  axisLabel: string
  note?: string
  rows: Row[]
  title: string
  total: UsageTotals
}) {
  const { t } = useI18n()
  const u = t.usage
  const sorted = [...rows].sort((a, b) => totalTokens(b.totals) - totalTokens(a.totals))
  const windowTokens = totalTokens(total)
  const id = `usage-${axisLabel}`

  return (
    <section className="panel" aria-labelledby={id}>
      <header className="panel-header panel-header--split">
        <div>
          <h2 id={id}>
            {title}
            {note !== undefined && <InfoHint>{note}</InfoHint>}
          </h2>
        </div>
      </header>

      {sorted.length === 0 ? (
        <p className="panel-empty">{u.nothingYet}</p>
      ) : (
        <table className="table usage-table">
          {/* 칸 폭을 정해 둔다. 숫자 칸이 넓게 벌어지지 않고, 긴 모델 이름은 말줄임으로 줄인다. */}
          <colgroup>
            <col />
            <col className="usage-col-tokens" />
            <col className="usage-col-share" />
            <col className="usage-col-cost" />
            <col className="usage-col-calls" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{axisLabel}</th>
              <th scope="col" className="num">{u.tokens}</th>
              <th scope="col">{u.share}</th>
              <th scope="col" className="num">{u.cost}</th>
              <th scope="col" className="num">{u.calls}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const tokens = totalTokens(row.totals)
              const share = windowTokens === 0 ? null : tokens / windowTokens
              return (
                <tr key={row.key}>
                  <td>
                    <span className="usage-row-label" title={row.label}>{row.label}</span>
                    <span className="usage-row-sub mono" title={row.sub}>{row.sub}</span>
                  </td>
                  <td className="num mono">{counts.format(tokens)}</td>
                  <td>
                    {/* 막대는 보조 표시이고 뜻은 옆의 숫자가 진다. */}
                    <span className="usage-share">
                      <span className="usage-share-track" aria-hidden="true">
                        <span
                          className="usage-share-fill"
                          style={{ width: `${(share ?? 0) * 100}%` }}
                        />
                      </span>
                      <span className="mono">{share === null ? u.dash : percents.format(share)}</span>
                    </span>
                  </td>
                  <td className="num mono">
                    {formatCost(row.totals.costUsd, u.costUnknown)}
                    {row.totals.costUsd !== null && row.totals.pricedCalls < row.totals.calls && (
                      <span
                        className="usage-partial"
                        title={u.partialHint(row.totals.pricedCalls, row.totals.calls)}
                      >
                        +
                      </span>
                    )}
                  </td>
                  <td className="num mono">{counts.format(row.totals.calls)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
