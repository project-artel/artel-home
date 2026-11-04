import { Navigate, useLocation } from 'react-router-dom'
import { LlmKeysPanel } from '../account/LlmKeysPanel'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { formatCost, totalTokens } from './format'
import { serviceLabel, type UsageTotals } from './usageApi'
import { UsageFigures } from './UsageFigures'
import { UsageGrass } from './UsageGrass'
import { Breakdown } from './UsageSection'
import { useProjectUsage } from './useProjectUsage'

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const percents = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })

/**
 * API 관리(ARTEL-1379). 예전 "사용량" 화면(모델 지출)과 계정 설정에 있던 LLM API 키를 한 화면에 둔다. 위는 키와 기능별
 * 지출 그래프, 가운데는 최근 12주 잔디를 칸 크기에 맞게 키워 남는 높이를 받고, 아래는 기능별 · 모델별 표다.
 */
export function ApiSection() {
  const { t } = useI18n()
  const a = t.usage.api
  const u = t.usage
  const { projectId } = useWorkspace()
  const { status, usage, grid, today } = useProjectUsage(projectId)

  return (
    <div className="api-page">
      <div className="api-top">
        <LlmKeysPanel note={a.keysScope} />
        <section aria-labelledby="api-share-title" className="panel api-share">
          <header className="panel-header">
            <h2 id="api-share-title">{a.spendTitle}</h2>
          </header>
          {status === 'loading' && <p className="panel-empty">{u.loading}</p>}
          {status === 'error' && <p className="panel-empty">{u.loadFailed}</p>}
          {status === 'ready' && usage !== null && <FeatureShare byService={usage.byService} total={usage.total} />}
        </section>
      </div>

      {status === 'ready' && usage !== null && grid !== null && (
        <>
          <section aria-labelledby="api-overview-title" className="panel api-overview">
            <header className="panel-header">
              <h2 id="api-overview-title">
                {u.sectionTitle}
                <InfoHint>{u.sectionSubtitle(usage.zone)}</InfoHint>
              </h2>
            </header>
            {usage.total.calls === 0 ? (
              <p className="panel-empty">{u.nothingYet}</p>
            ) : (
              <div className="usage-overview">
                <div className="usage-overview-grass">
                  <UsageGrass grid={grid} zone={usage.zone} />
                </div>
                <UsageFigures grid={grid} today={today} total={usage.total} />
              </div>
            )}
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
        </>
      )}
    </div>
  )
}

/** 옛 주소 `…/usage` 를 새 주소로 넘긴다. 북마크와 다른 화면의 링크가 계속 산다. */
export function UsageRedirect() {
  const { search } = useLocation()
  return <Navigate replace to={`../api${search}`} />
}

/**
 * 기능별 지출의 도넛 그래프와 범례. 비중은 토큰으로 잰다 — 단가를 모르는 호출이 있어도 일을 가장 많이 한 기능이
 * 가려지지 않는다(`Breakdown` 과 같은 기준). 색은 회색 단계다. 지출은 통과도 실패도 아니라 코랄 · 초록을 쓰지 않는다.
 */
function FeatureShare({ byService, total }: { byService: { service: string; totals: UsageTotals }[]; total: UsageTotals }) {
  const { t } = useI18n()
  const u = t.usage
  const a = u.api
  const windowTokens = totalTokens(total)
  const rows = [...byService]
    .sort((left, right) => totalTokens(right.totals) - totalTokens(left.totals))
    .map((cell, index) => ({
      key: cell.service,
      label: serviceLabel(cell.service, u.services),
      share: windowTokens === 0 ? 0 : totalTokens(cell.totals) / windowTokens,
      totals: cell.totals,
      tone: `api-tone-${Math.min(index, 4)}`,
    }))
  if (rows.length === 0) return <p className="panel-empty">{a.noSpend}</p>

  // 앞 조각들이 차지한 비율의 합이 다음 조각의 시작점이다.
  const starts = rows.map((_, index) => rows.slice(0, index).reduce((sum, row) => sum + row.share * 100, 0))
  return (
    <div className="api-share-body">
      <svg aria-hidden="true" className="api-donut" viewBox="0 0 120 120">
        <circle className="api-donut-track" cx="60" cy="60" r="46" />
        {rows.map((row, index) => {
          const length = Math.max(row.share * 100, 0.6)
          return (
            <circle
              className={`api-donut-arc ${row.tone}`}
              cx="60"
              cy="60"
              key={row.key}
              pathLength="100"
              r="46"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-starts[index]}
              transform="rotate(-90 60 60)"
            />
          )
        })}
        <text className="api-donut-value" textAnchor="middle" x="60" y="58">{formatCost(total.costUsd, u.costUnknown)}</text>
        <text className="api-donut-label" textAnchor="middle" x="60" y="74">{compact.format(windowTokens)} · {compact.format(total.calls)}</text>
      </svg>
      <ul className="api-share-legend">
        {rows.map((row) => (
          <li key={row.key}>
            <i aria-hidden="true" className={`api-share-dot ${row.tone}`} />
            <span className="api-share-name">
              {row.label}
              <span className="mono">{row.key}</span>
            </span>
            <span className="api-share-pct mono">{percents.format(row.share)}</span>
            <span className="api-share-cost mono">{formatCost(row.totals.costUsd, u.costUnknown)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
