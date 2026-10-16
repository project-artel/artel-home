import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { QaHistoryDetail } from '../../projects/workspace/QaHistoryDetail'
import { QaStatusPill } from '../../projects/workspace/QaStatusPill'
import { QA_TRY_STATUSES, qaRunPath, type QaTry, type QaTryStatus } from '../qaTypes'
import type { QaRunSummary } from '../launch/qaLaunchApi'
import { ringOf, shortWhen } from './historyModel'
import { PickSketch } from './HistorySketch'

/**
 * 고른 실행 하나(ARTEL-1100). 위는 그 실행의 결과를 숫자 셋과 큰 링으로, 아래는 시나리오마다 예전
 * 히스토리 행이 펼치던 상세(`QaHistoryDetail` — 결과 · 비용 · 도구 분포)를 그대로 둔다. 같은 것을
 * 두 벌 만들면 한쪽만 고쳐지는 날이 온다.
 */
export function RunInspector({
  projectId,
  run,
  ordinalLabel,
  testRunName,
  tries,
}: {
  projectId: string
  run: QaRunSummary | null
  ordinalLabel: string | null
  testRunName: string
  tries: QaTry[]
}) {
  const { t } = useI18n()
  const b = t.qa.history.board
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)

  if (run === null) {
    return (
      <aside aria-label={b.pickRun} className="qh-inspector">
        <div className="qh-inspector-empty">
          <PickSketch />
          <b>{b.pickTitle}</b>
          <span>{b.pickRun}</span>
        </div>
      </aside>
    )
  }

  const { tone, ratio } = ringOf(run)
  const hasCases = run.casesPassed !== null && run.casesTotal !== null && run.casesTotal > 0
  const circumference = 2 * Math.PI * 23
  const ordered = [...tries].sort((a, b2) => Number(a.id) - Number(b2.id))

  return (
    <aside aria-label={testRunName} className="qh-inspector">
      <div className="qh-inspector-scroll" ref={setScroller}>
        <div className="qh-inspector-head">
          <span className={`qh-ring qh-ring--lg qh-tone--${tone}`}>
            <svg aria-hidden="true" height="56" viewBox="0 0 56 56" width="56">
              <circle className="qh-ring-track" cx="28" cy="28" fill="none" r="23" strokeWidth="6" />
              {ratio > 0 && (
                <circle
                  className="qh-ring-fill"
                  cx="28"
                  cy="28"
                  fill="none"
                  r="23"
                  strokeDasharray={`${circumference * ratio} ${circumference}`}
                  strokeLinecap="round"
                  strokeWidth="6"
                  transform="rotate(-90 28 28)"
                />
              )}
            </svg>
            <span className="qh-ring-center mono">{hasCases ? `${Math.round(ratio * 100)}%` : ''}</span>
          </span>
          <span className="qh-inspector-title">
            <span className="qh-inspector-line">
              {ordinalLabel !== null && <b>{ordinalLabel}</b>}
              {isStatus(run.status) && <QaStatusPill status={run.status} />}
            </span>
            <span className="qh-ellipsis qh-inspector-name">{testRunName}</span>
            <span className="qh-muted mono">{shortWhen(run.startedAt)}</span>
          </span>
        </div>

        <div className="qh-figures">
          <div>
            <span>{b.cases}</span>
            <b className="mono">
              {hasCases ? run.casesPassed : '—'}
              {hasCases && <small>/{run.casesTotal}</small>}
            </b>
          </div>
          <div>
            <span>{b.scenariosLabel}</span>
            <b className="mono">{ordered.length}</b>
          </div>
          <div className={run.issueCount > 0 ? 'is-bad' : undefined}>
            <span>{b.issuesLabel}</span>
            <b className="mono">{run.issueCount}</b>
          </div>
        </div>

        <div className="qh-inspector-links">
          <Link className="button button--secondary button--compact" to={qaRunPath(projectId, run.id)}>{b.timeline}</Link>
          <Link
            className="button button--secondary button--compact"
            to={`/projects/${encodeURIComponent(projectId)}/qa-runs/${encodeURIComponent(run.id)}/performance`}
          >
            {b.performance}
          </Link>
        </div>

        {ordered.map((qaTry, index) => (
          <section className="qh-scenario" key={qaTry.id}>
            <h3 className="qh-scenario-head">
              <Link to={qaRunPath(projectId, run.id, qaTry.id)}>{b.scenarioFallback(index + 1)}</Link>
            </h3>
            <QaHistoryDetail qaTryId={qaTry.id} />
          </section>
        ))}
      </div>
      <EdgeScrollbar label={testRunName} scroller={scroller} side="right" />
    </aside>
  )
}

/** 서버가 새 상태를 보내도 화면이 깨지지 않게, 아는 상태만 알약으로 그린다. */
function isStatus(value: string): value is QaTryStatus {
  return (QA_TRY_STATUSES as readonly string[]).includes(value)
}
