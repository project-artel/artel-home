import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { LlmKeysPanel } from '../account/LlmKeysPanel'
import { useI18n } from '../i18n/useI18n'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { KeyIcon, LockIcon } from '../qa/qaModelIcons'
import { formatCost, totalTokens } from './format'
import { serviceLabel } from './usageApi'
import { UsageFigures } from './UsageFigures'
import { UsageGrass } from './UsageGrass'
import { Breakdown, UsageSection } from './UsageSection'
import { useProjectUsage } from './useProjectUsage'

type ApiTab = 'spend' | 'keys'

const counts = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const percents = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })

/**
 * API 관리(ARTEL-1379). 예전 "사용량" 화면이 "모델 지출" 탭이 되고, 계정 설정에 있던 LLM API 키가 "API 키" 탭으로 왔다.
 * 고른 탭은 주소(`?tab=keys`)에 남아 새로고침 · 공유해도 그 탭이 열린다.
 */
export function ApiSection() {
  const { t } = useI18n()
  const a = t.usage.api
  const [params, setParams] = useSearchParams()
  const tab: ApiTab = params.get('tab') === 'keys' ? 'keys' : 'spend'

  function pick(next: ApiTab) {
    setParams(
      (current) => {
        if (next === 'spend') current.delete('tab')
        else current.set('tab', next)
        return current
      },
      { replace: true },
    )
  }

  return (
    <div className={tab === 'keys' ? 'api-section api-section--keys' : 'api-section'}>
      {/* QA 실행 화면의 로그 탭(흐름 · Raw · 이슈)과 같은 모양이다. */}
      <div aria-label={a.tabsLabel} className="qa-log-tabs api-tabs" role="tablist">
        <button aria-selected={tab === 'spend'} className={tab === 'spend' ? 'on' : ''} onClick={() => pick('spend')} role="tab" type="button">
          {a.spendTab}
        </button>
        <button aria-selected={tab === 'keys'} className={tab === 'keys' ? 'on' : ''} onClick={() => pick('keys')} role="tab" type="button">
          {a.keysTab}
        </button>
      </div>
      <div className="api-panel" role="tabpanel">
        {tab === 'spend' ? <UsageSection /> : <ApiKeysTab />}
      </div>
    </div>
  )
}

/** 옛 주소 `…/usage` 를 새 주소로 넘긴다. 북마크와 다른 화면의 링크가 계속 산다. */
export function UsageRedirect() {
  const { search } = useLocation()
  return <Navigate replace to={`../api${search}`} />
}

/**
 * API 키 탭. 왼쪽은 계정 설정에서 옮겨 온 키 목록(`LlmKeysPanel`) 그대로, 오른쪽은 그 키들이 쓰이는 곳 — 이 프로젝트의
 * 기능별 지출이다. 키는 계정 단위라 화면 머리에 그 범위를 밝힌다.
 */
function ApiKeysTab() {
  const { t } = useI18n()
  const a = t.usage.api
  const u = t.usage
  const { projectId } = useWorkspace()
  const { status, usage, grid, today } = useProjectUsage(projectId)
  const windowTokens = usage === null ? 0 : totalTokens(usage.total)
  const rows =
    usage === null
      ? []
      : [...usage.byService]
          .sort((left, right) => totalTokens(right.totals) - totalTokens(left.totals))
          .map((cell) => ({
            key: cell.service,
            label: serviceLabel(cell.service, u.services),
            share: windowTokens === 0 ? 0 : totalTokens(cell.totals) / windowTokens,
            totals: cell.totals,
          }))
  const tipIcons = [<KeyIcon key="key" size={16} />, <LockIcon key="lock" size={16} />, <SpendIcon key="spend" />]

  return (
    <div className="api-keys">
      <div className="api-keys-main">
        <LlmKeysPanel note={a.keysScope} />
        {/* 키가 실제로 어느 모델에 쓰였나. 모델 지출 탭의 모델별 표와 같은 것이다. */}
        {usage !== null && (
          <div className="api-models">
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
        )}
        {usage !== null && grid !== null && usage.total.calls > 0 && (
          <section aria-labelledby="api-overview-title" className="panel api-overview">
            <header className="panel-header">
              <h2 id="api-overview-title">{u.sectionTitle}</h2>
            </header>
            <div className="usage-overview">
              <div className="usage-overview-grass">
                <UsageGrass grid={grid} zone={usage.zone} />
              </div>
              <UsageFigures grid={grid} today={today} total={usage.total} />
            </div>
          </section>
        )}
      </div>

      <aside aria-labelledby="api-spend-title" className="panel api-spend">
        <header className="panel-header panel-header--split">
          <h2 id="api-spend-title">{a.spendTitle}</h2>
          <Link className="button button--secondary button--compact" to="?">
            {a.spendLink} ›
          </Link>
        </header>
        <KeyFlowArt labels={rows.slice(0, 3).map((row) => `${row.label} · ${percents.format(row.share)}`)} />
        {status === 'loading' && <p className="panel-empty">{u.loading}</p>}
        {status === 'error' && <p className="panel-empty">{u.loadFailed}</p>}
        {status === 'ready' && usage !== null && (
          <>
            {rows.length === 0 ? (
              <p className="panel-empty">{a.noSpend}</p>
            ) : (
              <ul className="api-spend-rows">
                {rows.map((row) => (
                  <li key={row.key}>
                    <span className="api-spend-name">
                      {row.label}
                      <span className="mono">{row.key}</span>
                    </span>
                    <span aria-hidden="true" className="api-spend-bar">
                      <span style={{ width: `${Math.max(2, Math.round(row.share * 100))}%` }} />
                    </span>
                    <span className="api-spend-share mono">{percents.format(row.share)}</span>
                    <span className="api-spend-cost mono">{formatCost(row.totals.costUsd, u.costUnknown)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="api-spend-totals">
              <div>
                <span>{u.tokens}</span>
                <b className="mono">{counts.format(windowTokens)}</b>
              </div>
              <div>
                <span>{u.cost}</span>
                <b className="mono">{formatCost(usage.total.costUsd, u.costUnknown)}</b>
              </div>
              <div>
                <span>{u.calls}</span>
                <b className="mono">{counts.format(usage.total.calls)}</b>
              </div>
            </div>
          </>
        )}
            <div className="api-tips">
              {a.tips.map((tip, index) => (
                <div className="api-tip" key={tip.title}>
                  <span aria-hidden="true" className="api-tip-icon">{tipIcons[index]}</span>
                  <div>
                    <b>{tip.title}</b>
                    <p>{tip.body}</p>
                  </div>
                </div>
              ))}
            </div>

      </aside>
    </div>
  )
}

/** 지출 칸 머리의 그림: 열쇠에서 나간 점선이 기능 셋으로 흘러간다. 장식이라 낭독기에는 감춘다. */
function KeyFlowArt({ labels }: { labels: string[] }) {
  return (
    <svg aria-hidden="true" className="api-flow-art" fill="none" viewBox="0 0 420 120">
      <rect className="api-flow-key" height="64" rx="12" width="96" x="12" y="28" />
      <circle className="api-flow-accent" cx="42" cy="60" r="10" strokeWidth="2" />
      <path className="api-flow-accent" d="M52 60h36v9M76 60v7" strokeLinecap="round" strokeWidth="2" />
      <path className="api-flow-line api-flow-line--hot" d="M112 60 C 170 60, 190 22, 250 22" />
      <path className="api-flow-line" d="M112 60 H 250" />
      <path className="api-flow-line" d="M112 60 C 170 60, 190 98, 250 98" />
      {[9, 47, 85].map((y, index) => (
        <g key={y}>
          <rect className={'api-flow-node' + (index === 0 ? ' api-flow-node--hot' : '') + (labels[index] === undefined ? ' api-flow-node--empty' : '')} height="26" rx="8" width="160" x="252" y={y} />
          {labels[index] !== undefined && (
            <text className="api-flow-label" x="264" y={y + 17}>{labels[index]}</text>
          )}
        </g>
      ))}
      <circle className="api-flow-pulse" cx="250" cy="22" r="4" />
    </svg>
  )
}

function SpendIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
      <path d="M4 19l5-6 4 3 7-9" />
      <path d="M16 7h4v4" />
    </svg>
  )
}
