import { useState } from 'react'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import type { TestRun } from '../../testRuns/testRunApi'
import { ProviderLogo } from '../launch/ProviderLogo'
import type { QaRunSummary } from '../launch/qaLaunchApi'
import { isRunning, matchesFilter, ringOf, runOrdinals, shortWhen, type HistoryFilter } from './historyModel'
import type { TestRunHistory } from './useHistoryRuns'

const DAY = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' })

/**
 * 테스트 런 하나의 실행들(ARTEL-1100). 머리에 이름 · 빌드 · 시나리오 수 · 에이전트 · 이슈를 두고,
 * 아래에 실행을 타일로 **최신부터 왼쪽에** 늘어놓는다. 타일 하나는 회차 · 통과율 링 · 통과/전체 ·
 * 날짜시각이다 — 글을 읽지 않아도 "나아지고 있나" 가 링 색으로 보이게.
 *
 * 줄이 넘치면 가로로 스크롤하고, 그 막대는 서비스 스크롤바(`EdgeScrollbar`)다.
 */
export function RunCard({
  testRun,
  history,
  filter,
  selectedRunId,
  modelLabel,
  onSelect,
  onRetry,
}: {
  testRun: TestRun
  history: TestRunHistory
  filter: HistoryFilter
  selectedRunId: string | null
  modelLabel: (modelId: string) => string
  onSelect: (run: QaRunSummary) => void
  onRetry: () => void
}) {
  const { t } = useI18n()
  const b = t.qa.history.board
  const [strip, setStrip] = useState<HTMLDivElement | null>(null)

  if (history.status !== 'ready') {
    return (
      <section aria-label={testRun.name} className="qh-card">
        <div className="qh-card-head">
          <h3 className="qh-card-name">{testRun.name}</h3>
        </div>
        {history.status === 'loading' ? (
          <p className="qh-card-note">{b.loading}</p>
        ) : (
          <p className="qh-card-note">
            {b.loadFailed}{' '}
            <button className="qh-text-button" onClick={onRetry} type="button">{b.retry}</button>
          </p>
        )}
      </section>
    )
  }

  const newestFirst = [...history.runs].sort((a, b2) => b2.startedAt.localeCompare(a.startedAt))
  const shown = newestFirst.filter((run) => matchesFilter(run, filter))
  if (shown.length === 0) return null

  const ordinals = runOrdinals(history.runs, history.complete)
  const latest = newestFirst[0]
  const issues = history.runs.reduce((sum, run) => sum + run.issueCount, 0)
  const build = testRun.gameBuild?.label ?? testRun.gameBuild?.version ?? latest.gameBuildVersion

  return (
    <section aria-label={testRun.name} className="qh-card">
      <div className="qh-card-head">
        <h3 className="qh-card-name">{testRun.name}</h3>
        {build !== null && build !== undefined && <span className="qh-pill mono">{build}</span>}
        {testRun.scenarioCount !== null && <span className="qh-pill">{b.scenarios(testRun.scenarioCount)}</span>}
        {latest.model !== null && (
          <span className="qh-pill">
            <ProviderLogo provider={latest.model} size={12} />
            {modelLabel(latest.model)}
          </span>
        )}
        <span className="qh-spacer" />
        {issues > 0 && <span className="qh-pill qh-pill--bad">{b.issues(issues)}</span>}
        <span className="qh-card-meta">{b.runsMeta(history.runs.length, DAY.format(new Date(latest.startedAt)))}</span>
      </div>
      <div className="qh-strip-frame">
        <div className="qh-strip" ref={setStrip}>
          <span aria-hidden="true" className="qh-newest">
            <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
              <path d="M19 12h-14 M11 6l-6 6l6 6" />
            </svg>
            {b.newest}
          </span>
          {shown.map((run) => (
            <RunTile
              key={run.id}
              onSelect={() => onSelect(run)}
              ordinal={ordinals.get(run.id) ?? null}
              run={run}
              selected={run.id === selectedRunId}
              testRunName={testRun.name}
            />
          ))}
        </div>
        <EdgeScrollbar label={testRun.name} scroller={strip} side="bottom" />
      </div>
      {!history.complete && <p className="qh-card-note">{b.moreOlder}</p>}
    </section>
  )
}

function RunTile({
  run,
  ordinal,
  selected,
  testRunName,
  onSelect,
}: {
  run: QaRunSummary
  ordinal: number | null
  selected: boolean
  testRunName: string
  onSelect: () => void
}) {
  const { t } = useI18n()
  const b = t.qa.history.board
  const { tone, ratio } = ringOf(run)
  const hasCases = run.casesPassed !== null && run.casesTotal !== null && run.casesTotal > 0
  const center =
    tone === 'running' ? '' : tone === 'cancelled' ? '—' : hasCases ? String(Math.round(ratio * 100)) : run.status === 'FAILED' ? '!' : '✓'
  const result = isRunning(run)
    ? b.running
    : run.status === 'CANCELLED'
      ? b.cancelled
      : hasCases
        ? `${run.casesPassed}/${run.casesTotal}`
        : run.status === 'FAILED'
          ? b.failed
          : b.noVerdict
  const when = shortWhen(run.startedAt)
  const circumference = 2 * Math.PI * 16

  return (
    <button
      aria-label={b.tileLabel(ordinal === null ? testRunName : `${testRunName} ${b.ordinal(ordinal)}`, when, result)}
      aria-pressed={selected}
      className={`qh-tile${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      type="button"
    >
      {ordinal !== null && <span className="qh-tile-ordinal">{b.ordinal(ordinal)}</span>}
      <span className={`qh-ring qh-tone--${tone}`}>
        <svg aria-hidden="true" height="40" viewBox="0 0 40 40" width="40">
          <circle className="qh-ring-track" cx="20" cy="20" fill="none" r="16" strokeWidth="5" />
          {ratio > 0 && (
            <circle
              className="qh-ring-fill"
              cx="20"
              cy="20"
              fill="none"
              r="16"
              strokeDasharray={`${circumference * ratio} ${circumference}`}
              strokeLinecap="round"
              strokeWidth="5"
              transform="rotate(-90 20 20)"
            />
          )}
        </svg>
        <span className="qh-ring-center mono">{center}</span>
      </span>
      <span className={`qh-tile-result mono qh-tone-text--${tone}`}>{result}</span>
      <span className="qh-tile-when mono">{when}</span>
    </button>
  )
}
