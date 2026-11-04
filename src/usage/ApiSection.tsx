import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { LlmKeysPanel } from '../account/LlmKeysPanel'
import { ProviderLogo } from '../qa/launch/ProviderLogo'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { formatCost, totalTokens } from './format'
import { dayAt, dayTokens, toDateKey, type GrassDay, type GrassGrid } from './grass'
import { serviceLabel, type UsageTotals } from './usageApi'
import { UsageGrass } from './UsageGrass'
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
                <SpendFigures grid={grid} today={today} total={usage.total} />
              </div>
            )}
          </section>

          <div className="usage-breakdowns">
            <SpendTable
              axis={u.featureAxis}
              note={u.embeddingNote}
              rows={usage.byService.map((cell) => ({
                key: cell.service,
                label: serviceLabel(cell.service, u.services),
                sub: cell.service,
                icon: <FeatureIcon service={cell.service} />,
                totals: cell.totals,
              }))}
              title={u.byFeature}
              total={usage.total}
            />
            <SpendTable
              axis={u.modelAxis}
              rows={usage.byModel.map((cell) => ({
                key: `${cell.provider}/${cell.model}`,
                label: cell.model,
                sub: cell.provider,
                // 모델 제공사 로고. bedrock 처럼 중개 이름이면 모델 이름에서 회사를 읽는다(ProviderLogo 가 포함으로 찾는다).
                icon: <ProviderLogo provider={`${cell.provider} ${cell.model}`} size={20} />,
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
      tone: `api-tone-${Math.min(index, PALETTE_SIZE - 1)}`,
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

/** 그래프 색 수. 지출은 통과(초록) · 실패(코랄)가 아니라 그 둘을 빼고 서로 다른 색 계열을 쓴다. */
const PALETTE_SIZE = 6

/** 기능마다 사이드바의 그 화면 아이콘(15px 선)을 쓴다. 모르는 기능은 칸 모양 하나다. */
const FEATURE_ICON_PATHS: Record<string, string[]> = {
  QA_RUN: ['M8.8 2L4 9h3.4l-.9 5L12 7H8.4z'],
  SCENARIO: ['M5.2 3.4l7 4.6-7 4.6z'],
  KNOWLEDGE_QUERY: ['M4 4.6l4.4 2.2', 'M8.4 6.8L12 11.4', 'M4 4.6l1.6 6.8', 'M5.6 11.4h6.4'],
  GAME_CONTEXT: ['M4 2h5.3L12 4.7V14H4z', 'M9.3 2v2.7H12', 'M6 8h4', 'M6 10.5h4'],
  EMBEDDING: ['M3 3h3v3H3z', 'M10 3h3v3h-3z', 'M3 10h3v3H3z', 'M10 10h3v3h-3z', 'M6 4.5h4M4.5 6v4M11.5 6v4M6 11.5h4'],
}

function FeatureIcon({ service }: { service: string }) {
  const paths = FEATURE_ICON_PATHS[service] ?? ['M3 3h10v10H3z']
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} viewBox="0 0 16 16" width="18">
      {paths.map((d) => <path d={d} key={d} />)}
    </svg>
  )
}

/** 수치 칸 아이콘(24px 선, Tabler 모양). */
function FigureIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="20">
      <path d={d} />
    </svg>
  )
}

const counts = new Intl.NumberFormat()

/**
 * 잔디 옆 수치 넷(ARTEL-1379). 숫자만 늘어놓지 않고 칸마다 아이콘과 작은 막대 그래프를 단다 — 12주 합계는 주마다,
 * 나머지 셋은 최근 14일이고 그 칸이 가리키는 날이 짙다. 값은 예전 `UsageFigures` 와 같은 잔디 데이터에서 읽는다.
 */
function SpendFigures({ grid, today, total }: { grid: GrassGrid; today: Date; total: UsageTotals }) {
  const { t } = useI18n()
  const u = t.usage
  const a = u.api
  const days = grid.weeks.flat().filter((day) => day.inRange)
  const weekly = grid.weeks.map((week) => week.reduce((sum, day) => sum + (day.totals === null ? 0 : dayTokens(day.totals)), 0))
  const recent = days.slice(-14)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const todayTotals = dayAt(grid, today)
  const yesterdayTotals = dayAt(grid, yesterday)
  const busiest = days.reduce<GrassDay | null>((best, day) => {
    const tokens = day.totals === null ? 0 : dayTokens(day.totals)
    return tokens > 0 && (best === null || tokens > dayTokens(best.totals ?? { inputTokens: 0, outputTokens: 0, costUsd: null, calls: 0 })) ? day : best
  }, null)
  const todayTokens = todayTotals === null ? 0 : dayTokens(todayTotals)
  const yesterdayTokens = yesterdayTotals === null ? 0 : dayTokens(yesterdayTotals)
  const delta = todayTokens === 0 || yesterdayTotals === null ? null : (yesterdayTokens - todayTokens) / todayTokens
  const dayHint = (totals: typeof todayTotals) =>
    totals === null ? u.noRecord : u.dayHint(formatCost(totals.costUsd, u.costUnknown), counts.format(totals.calls))
  const keyOf = (date: Date) => toDateKey(date)

  return (
    <div className="api-figures">
      <FigureCard
        chart={<MiniBars caption={a.weeklyCaption} values={weekly} />}
        hint={total.costUsd === null ? u.noPricedCall : u.fullyPriced(formatCost(total.costUsd, u.costUnknown), total.calls)}
        icon={<FigureIcon d="M18 5H6l6 7-6 7h12" />}
        label={u.windowTotal}
        tone={0}
        value={counts.format(totalTokens(total))}
      />
      <FigureCard
        chart={<MiniBars caption={a.recentCaption} highlight={recent.findIndex((day) => day.date === keyOf(today))} values={recent.map((day) => (day.totals === null ? 0 : dayTokens(day.totals)))} />}
        hint={dayHint(todayTotals)}
        icon={<FigureIcon d="M12 4v1M12 19v1M4 12h1M19 12h1M6.3 6.3l.7.7M17 17l.7.7M6.3 17.7l.7-.7M17 7l.7-.7M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0" />}
        label={u.today}
        tone={1}
        value={todayTotals === null ? u.dash : counts.format(todayTokens)}
      />
      <FigureCard
        chart={<MiniBars caption={a.recentCaption} highlight={recent.findIndex((day) => day.date === keyOf(yesterday))} values={recent.map((day) => (day.totals === null ? 0 : dayTokens(day.totals)))} />}
        hint={delta === null ? dayHint(yesterdayTotals) : `${dayHint(yesterdayTotals)} · ${a.vsToday(percents.format(delta))}`}
        icon={<FigureIcon d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM16 3v4M8 3v4M4 11h16" />}
        label={u.yesterday}
        tone={2}
        value={yesterdayTotals === null ? u.dash : counts.format(yesterdayTokens)}
      />
      <FigureCard
        chart={<MiniBars caption={a.recentCaption} highlight={busiest === null ? -1 : recent.findIndex((day) => day.date === busiest.date)} values={recent.map((day) => (day.totals === null ? 0 : dayTokens(day.totals)))} />}
        hint={busiest === null ? u.noRecord : a.busiestOn(busiest.date)}
        icon={<FigureIcon d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM5 9a2 2 0 0 1-2-2V5h4M19 9a2 2 0 0 0 2-2V5h-4" />}
        label={u.busiestDay}
        tone={3}
        value={grid.max === 0 ? u.dash : counts.format(grid.max)}
      />
    </div>
  )
}

function FigureCard({ icon, label, value, hint, chart, tone }: { icon: ReactNode; label: string; value: string; hint: string; chart: ReactNode; tone: number }) {
  return (
    <div className="api-figure">
      <div className="api-figure-head">
        <span aria-hidden="true" className={`api-figure-icon api-ink-${tone}`}>{icon}</span>
        <span className="api-figure-label">{label}</span>
      </div>
      <b className="api-figure-value mono">{value}</b>
      <span className="api-figure-hint">{hint}</span>
      <div className={`api-figure-chart api-ink-${tone}`}>{chart}</div>
    </div>
  )
}

/** 작은 막대 그래프. 가장 큰 값을 칸 높이로 두고, [highlight] 번째 막대만 짙다. */
function MiniBars({ values, highlight = -1, caption }: { values: number[]; highlight?: number; caption: string }) {
  const max = Math.max(1, ...values)
  const width = 100 / Math.max(1, values.length)
  return (
    <svg aria-label={caption} className="api-minibars" preserveAspectRatio="none" role="img" viewBox="0 0 100 32">
      {values.map((value, index) => {
        const height = value === 0 ? 1.5 : Math.max(3, (value / max) * 30)
        return (
          <rect
            className={index === highlight ? 'is-hot' : undefined}
            height={height}
            key={index}
            rx="1"
            width={width * 0.64}
            x={index * width + width * 0.18}
            y={32 - height}
          />
        )
      })}
    </svg>
  )
}

/**
 * 기능별 · 모델별 지출(ARTEL-1379). 예전 표(`Breakdown`)는 글자만 빽빽했다. 줄마다 아이콘(기능은 화면 아이콘, 모델은
 * 제공사 로고)과 도넛과 같은 색의 막대를 두고 줄 간격을 넓힌다. 토큰 순으로 놓는다 — 단가를 모르는 호출이 있어도 일을
 * 가장 많이 한 줄이 아래로 가라앉지 않는다.
 */
function SpendTable({
  title,
  axis,
  note,
  rows,
  total,
}: {
  title: string
  axis: string
  note?: string
  rows: { key: string; label: string; sub: string; icon: ReactNode; totals: UsageTotals }[]
  total: UsageTotals
}) {
  const { t } = useI18n()
  const u = t.usage
  const windowTokens = totalTokens(total)
  const sorted = [...rows].sort((left, right) => totalTokens(right.totals) - totalTokens(left.totals))
  const id = `api-table-${axis}`
  return (
    <section aria-labelledby={id} className="panel api-table">
      <header className="panel-header">
        <h2 id={id}>
          {title}
          {note !== undefined && <InfoHint>{note}</InfoHint>}
        </h2>
      </header>
      {sorted.length === 0 ? (
        <p className="panel-empty">{u.nothingYet}</p>
      ) : (
        <div className="api-table-rows" role="table">
          <div className="api-table-row api-table-row--head" role="row">
            <span role="columnheader">{axis}</span>
            <span role="columnheader">{u.share}</span>
            <span className="num" role="columnheader">{u.tokens}</span>
            <span className="num" role="columnheader">{u.cost}</span>
            <span className="num" role="columnheader">{u.calls}</span>
          </div>
          {sorted.map((row, index) => {
            const share = windowTokens === 0 ? 0 : totalTokens(row.totals) / windowTokens
            const tone = Math.min(index, PALETTE_SIZE - 1)
            return (
              <div className="api-table-row" key={row.key} role="row">
                <span className="api-table-name" role="cell">
                  <span aria-hidden="true" className={`api-table-icon api-ink-${tone}`}>{row.icon}</span>
                  <span className="api-table-label">
                    <b>{row.label}</b>
                    <span className="mono">{row.sub}</span>
                  </span>
                </span>
                <span className="api-table-share" role="cell">
                  <span aria-hidden="true" className="api-table-bar">
                    <span className={`api-fill-${tone}`} style={{ width: `${Math.max(1.5, share * 100)}%` }} />
                  </span>
                  <span className="mono">{percents.format(share)}</span>
                </span>
                <span className="num mono" role="cell">{counts.format(totalTokens(row.totals))}</span>
                <span className="num mono" role="cell">{formatCost(row.totals.costUsd, u.costUnknown)}</span>
                <span className="num mono" role="cell">{counts.format(row.totals.calls)}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
