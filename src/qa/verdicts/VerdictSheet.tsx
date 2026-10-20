import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { qaRunPath } from '../qaTypes'
import type { VerdictRow } from './verdictRows'

/**
 * 고른 판정 하나의 근거. 위에서 아래로 "무엇을 보았나 → 왜 그렇게 판정했나 → 기대 항목마다 근거와 기록 대조 →
 * 사진" 순이다. 판정을 믿을지는 마지막 둘이 정한다 — 앞의 둘은 테스터의 말이고, 대조는 그 말이 기록과 맞는지다.
 */
export function VerdictSheet({ projectId, qaRunId, row }: { projectId: string; qaRunId: string; row: VerdictRow | null }) {
  const { t } = useI18n()
  const copy = t.qa.verdicts
  const s = copy.sheet
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)

  if (row === null) {
    return (
      <aside className="qv-sheet qv-sheet--empty">
        <p className="panel-empty">{s.empty}</p>
      </aside>
    )
  }

  const { detail } = row

  return (
    <aside aria-label={copy.title} className="qv-sheet">
      <div className="qv-sheet-scroll" ref={setScroller}>
        <header className="qv-sheet-head">
          <span className="qv-muted">
            {row.scenarioOrdinal}. {row.scenarioTitle} · {copy.stepLabel(row.step)}
          </span>
          <h2 className="qv-sheet-title">{row.stepTitle ?? copy.stepLabel(row.step)}</h2>
          <span className="qv-sheet-badges">
            <span className={`qv-verdict qv-verdict--${row.passed ? 'passed' : 'failed'}`}>
              <span className={`vdot vdot--${row.passed ? 'verified' : 'failed'}`} />
              {row.passed ? copy.passed : copy.failed}
            </span>
            <span className={`qv-ev qv-ev--${detail.status}`}>{copy.evidence[detail.status]}</span>
          </span>
          <p className="qv-hint">{copy.evidenceHint[detail.status]}</p>
        </header>

        <section className="qv-sheet-section">
          <h3>{s.note}</h3>
          <p>{detail.message}</p>
        </section>

        {detail.reason !== null && (
          <section className="qv-sheet-section">
            <h3>{s.reason}</h3>
            <p>{detail.reason}</p>
          </section>
        )}

        <section className="qv-sheet-section">
          <h3>{s.checks}</h3>
          {detail.checks.length === 0 ? (
            <p className="qv-muted">{s.noChecks}</p>
          ) : (
            <ol className="qv-checks">
              {detail.checks.map((check, index) => (
                <li className="qv-check" key={index}>
                  <div className="qv-check-line">
                    <span className={`qv-met qv-met--${check.met}`}>{s.met[check.met]}</span>
                    <span>
                      <span className="qv-check-label">{s.expected}</span> {check.expected}
                    </span>
                  </div>
                  {check.observed.length > 0 && (
                    <div className="qv-check-observed">
                      <span className="qv-check-label">{s.observed}</span> {check.observed}
                    </div>
                  )}
                  {check.sources.length > 0 && (
                    <ul className="qv-sources" aria-label={s.sources}>
                      {check.sources.map((source, sourceIndex) => (
                        <li className={`qv-source qv-source--${source.citation}`} key={sourceIndex}>
                          <code translate="no">
                            {source.key ?? source.kind}
                            {source.value !== null && ` = ${source.value}`}
                          </code>
                          <span className="qv-citation">{s.citation[source.citation]}</span>
                          {source.citation === 'mismatch' && source.recorded !== null && (
                            <code className="qv-recorded" translate="no">{s.recorded(source.recorded)}</code>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {row.captures.length > 0 && (
          <section className="qv-sheet-section">
            <h3>{s.captures}</h3>
            <div className="qv-captures">
              {row.captures.map((capture) => (
                <a href={capture.url} key={capture.captureId} rel="noreferrer" target="_blank">
                  <img alt={capture.captureId} loading="lazy" src={capture.url} />
                </a>
              ))}
            </div>
          </section>
        )}

        <div className="qv-sheet-links">
          <Link className="button button--secondary button--compact" to={qaRunPath(projectId, qaRunId, row.qaTryId)}>
            {s.timeline}
          </Link>
        </div>
      </div>
      <EdgeScrollbar label={copy.title} scroller={scroller} side="right" />
    </aside>
  )
}
