import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { qaRunPath } from '../qaTypes'
import { getQaRunVerdicts, tallyVerdicts, type QaRunVerdicts } from '../qaVerdictApi'
import type { QaEvidenceStatus } from '../qaVerdictEvidence'
import { VerdictSheet } from './VerdictSheet'
import { rowKey, type VerdictRow } from './verdictRows'

type VerdictFilter = 'ALL' | 'PASSED' | 'FAILED'
type EvidenceFilter = 'ALL' | QaEvidenceStatus

const EVIDENCE_STATES: QaEvidenceStatus[] = ['verified', 'uncertain', 'none']

/**
 * 런 하나의 판정 근거(ARTEL-1135). QA 가 끝난 뒤 "왜 이 판정인가" 를 보는 자리다.
 *
 * 케이스 라이브러리와 같은 꼴이다 — 거르기 칩 줄, 전폭 표, 고른 줄의 상세가 오른쪽 칸. 기본은 검증 스텝만이다:
 * 행동 스텝의 판정은 "그 행동을 했다" 라서 근거를 묻지 않는다. `?try=&step=` 으로 들어오면 그 판정을 골라 연다.
 */
export function QaVerdictsRoute() {
  const { projectId = '', qaRunId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useI18n()
  const copy = t.qa.verdicts

  const [data, setData] = useState<QaRunVerdicts | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'error'>('loading')
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('ALL')
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>('ALL')
  // 시나리오 상세에서 들어오면(`?scenario=`) 그 시나리오로 걸러서 연다.
  const [scenarioFilter, setScenarioFilter] = useState<string>(() => searchParams.get('scenario') ?? 'ALL')
  const [onlyChecks, setOnlyChecks] = useState(true)
  const [tableScroller, setTableScroller] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getQaRunVerdicts(qaRunId, controller.signal)
      .then((result) => {
        setData(result)
        setState(result === null ? 'gone' : 'ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error')
      })
    return () => controller.abort()
  }, [qaRunId])

  const rows: VerdictRow[] = useMemo(
    () =>
      (data?.tries ?? []).flatMap((qaTry, index) =>
        qaTry.verdicts.map((verdict) => ({
          ...verdict,
          qaTryId: qaTry.qaTryId,
          scenarioTitle: qaTry.scenarioTitle,
          scenarioOrdinal: index + 1,
        })),
      ),
    [data],
  )
  const tally = useMemo(() => tallyVerdicts(rows), [rows])

  const shown = rows.filter(
    (row) =>
      (!onlyChecks || row.isVerification) &&
      (verdictFilter === 'ALL' || row.passed === (verdictFilter === 'PASSED')) &&
      (evidenceFilter === 'ALL' || row.detail.status === evidenceFilter) &&
      (scenarioFilter === 'ALL' || row.qaTryId === scenarioFilter),
  )

  // 시나리오가 하나면 모든 줄이 같은 이름이다 — 칸을 비워 사유에 자리를 준다.
  const manyScenarios = (data?.tries.length ?? 0) > 1
  const picked = searchParams.get('try') !== null ? `${searchParams.get('try')}:${searchParams.get('step')}` : null
  const selected = rows.find((row) => rowKey(row) === picked) ?? null
  const select = (row: VerdictRow) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('try', row.qaTryId)
        next.set('step', String(row.step))
        return next
      },
      { replace: true },
    )

  const back = (
    <Link className="back-link" to={qaRunPath(projectId, qaRunId)}>
      {copy.back}
    </Link>
  )

  if (state !== 'ready' || data === null) {
    const message = state === 'loading' ? copy.loading : state === 'gone' ? copy.gone : copy.loadFailed
    return (
      <section className="page qv-page" aria-busy={state === 'loading'}>
        <header className="qv-head">{back}</header>
        <p className={state === 'error' ? 'panel-message' : 'panel-empty'} role={state === 'error' ? 'alert' : undefined}>
          {message}
        </p>
      </section>
    )
  }

  const chip = (on: boolean, label: ReactNode, onClick: () => void, key?: string) => (
    <button aria-pressed={on} className={on ? 'fchip on' : 'fchip'} key={key} onClick={onClick} type="button">
      {label}
    </button>
  )

  return (
    <section className="page qv-page">
      <header className="qv-head">
        <div>
          {back}
          <h1 className="qv-title">{copy.title}</h1>
        </div>
        <p className="qv-summary mono">
          {copy.summary(tally.judged, tally.passed, tally.failed)}
          {EVIDENCE_STATES.map((status) => (
            <span className={`qv-ev qv-ev--${status}`} key={status} title={copy.evidenceHint[status]}>
              {copy.evidence[status]} {tally[status]}
            </span>
          ))}
        </p>
      </header>

      <div className="tcl-status-row qv-filters">
        <span className="field-label">{copy.verdictLabel}</span>
        <div className="tcl-chips">
          {chip(verdictFilter === 'ALL', copy.all, () => setVerdictFilter('ALL'))}
          {chip(verdictFilter === 'PASSED', <><span className="vdot vdot--verified" />{copy.passed}</>, () => setVerdictFilter('PASSED'))}
          {chip(verdictFilter === 'FAILED', <><span className="vdot vdot--failed" />{copy.failed}</>, () => setVerdictFilter('FAILED'))}
          <span className="tcl-chips-sep" aria-hidden="true" />
          <span className="field-label">{copy.evidenceLabel}</span>
          {chip(evidenceFilter === 'ALL', copy.all, () => setEvidenceFilter('ALL'))}
          {EVIDENCE_STATES.map((status) =>
            chip(evidenceFilter === status, copy.evidence[status], () => setEvidenceFilter(status), status),
          )}
          {data.tries.length > 1 && (
            <>
              <span className="tcl-chips-sep" aria-hidden="true" />
              <span className="field-label">{copy.scenarioLabel}</span>
              {chip(scenarioFilter === 'ALL', copy.all, () => setScenarioFilter('ALL'))}
              {data.tries.map((qaTry, index) =>
                chip(
                  scenarioFilter === qaTry.qaTryId,
                  <span className="qv-chip-title">{index + 1}. {qaTry.scenarioTitle}</span>,
                  () => setScenarioFilter(qaTry.qaTryId),
                  qaTry.qaTryId,
                ),
              )}
            </>
          )}
          <span className="tcl-chips-sep" aria-hidden="true" />
          <label className="qv-toggle">
            <input checked={onlyChecks} onChange={(event) => setOnlyChecks(event.target.checked)} type="checkbox" />
            {copy.onlyChecks}
          </label>
        </div>
      </div>

      <div className="qv-body">
        <div className="qv-table-wrap">
          <div className="qv-table-scroll" ref={setTableScroller}>
            {rows.length === 0 ? (
              <p className="panel-empty">{copy.empty}</p>
            ) : shown.length === 0 ? (
              <p className="panel-empty">{copy.noMatch}</p>
            ) : (
              <table className="tcl-table qv-table">
                <colgroup>
                  {manyScenarios && <col className="qv-c-scenario" />}
                  <col className="qv-c-step" />
                  <col className="qv-c-verdict" />
                  <col className="qv-c-evidence" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    {manyScenarios && <th>{copy.columns.scenario}</th>}
                    <th>{copy.columns.step}</th>
                    <th>{copy.columns.verdict}</th>
                    <th>{copy.columns.evidence}</th>
                    <th>{copy.columns.note}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const key = rowKey(row)
                    return (
                      <tr
                        aria-selected={key === picked}
                        className={key === picked ? 'qv-row is-selected' : 'qv-row'}
                        key={key}
                        onClick={() => select(row)}
                      >
                        {manyScenarios && (
                          <td className="qv-ellipsis" title={row.scenarioTitle}>
                            <span className="qv-muted mono">{row.scenarioOrdinal}</span> {row.scenarioTitle}
                          </td>
                        )}
                        <td className="qv-ellipsis" title={row.stepTitle ?? undefined}>
                          <span className="qv-muted mono">{row.step}</span> {row.stepTitle ?? copy.stepLabel(row.step)}
                          {!row.isVerification && <span className="qv-tag">{copy.action}</span>}
                        </td>
                        <td>
                          <span className={`qv-verdict qv-verdict--${row.passed ? 'passed' : 'failed'}`}>
                            <span className={`vdot vdot--${row.passed ? 'verified' : 'failed'}`} />
                            {row.passed ? copy.passed : copy.failed}
                          </span>
                        </td>
                        <td>
                          <span className={`qv-ev qv-ev--${row.detail.status}`} title={copy.evidenceHint[row.detail.status]}>
                            {copy.evidence[row.detail.status]}
                          </span>
                        </td>
                        <td className="qv-ellipsis">
                          <button className="qv-row-button" onClick={() => select(row)} type="button">
                            {row.detail.message}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <EdgeScrollbar label={copy.title} scroller={tableScroller} side="right" />
        </div>

        <VerdictSheet projectId={projectId} qaRunId={qaRunId} row={selected} />
      </div>
    </section>
  )
}
