import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { getQaRunVerdicts, tallyVerdicts, type QaStepVerdict } from '../qaVerdictApi'

const SHOWN = 4

type Flagged = QaStepVerdict & { qaTryId: string; ordinal: number }

/**
 * 고른 실행의 판정 근거 요약(ARTEL-1135). 근거 상태별 수와, 먼저 볼 판정 몇 개 — 실패했거나 근거가 기록과
 * 어긋난 것. 전부는 판정 근거 페이지에 있고, 줄을 누르면 그 판정을 골라 연다.
 */
export function RunVerdictSummary({ projectId, qaRunId }: { projectId: string; qaRunId: string }) {
  const { t } = useI18n()
  const copy = t.qa.verdicts
  const [verdicts, setVerdicts] = useState<Flagged[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getQaRunVerdicts(qaRunId, controller.signal)
      .then((result) =>
        setVerdicts(
          (result?.tries ?? []).flatMap((qaTry, index) =>
            qaTry.verdicts.map((verdict) => ({ ...verdict, qaTryId: qaTry.qaTryId, ordinal: index + 1 })),
          ),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setVerdicts([])
      })
    return () => controller.abort()
  }, [qaRunId])

  if (verdicts === null) return null
  const tally = tallyVerdicts(verdicts)
  if (tally.judged === 0) return null

  const page = `/projects/${encodeURIComponent(projectId)}/qa-runs/${encodeURIComponent(qaRunId)}/verdicts`
  const manyScenarios = new Set(verdicts.map((verdict) => verdict.qaTryId)).size > 1
  const flagged = verdicts.filter((verdict) => verdict.isVerification && (!verdict.passed || verdict.detail.status === 'uncertain'))

  return (
    <section className="qh-verdicts">
      <div className="qh-verdicts-head">
        <b>{copy.inspector.title}</b>
        <Link to={page}>{copy.inspector.open} →</Link>
      </div>
      <p className="qh-verdicts-tally mono">
        {(['verified', 'uncertain', 'none'] as const).map((status) => (
          <span className={`qv-ev qv-ev--${status}`} key={status} title={copy.evidenceHint[status]}>
            {copy.evidence[status]} {tally[status]}
          </span>
        ))}
      </p>
      {flagged.length === 0 ? (
        <p className="qh-muted">{tally.uncertain === 0 && tally.none === 0 ? copy.inspector.allClear : copy.summary(tally.judged, tally.passed, tally.failed)}</p>
      ) : (
        <>
          <span className="qh-verdicts-label">{copy.inspector.review}</span>
          <ul className="qh-verdicts-list">
            {flagged.slice(0, SHOWN).map((verdict) => (
              <li key={`${verdict.qaTryId}:${verdict.step}`}>
                <Link to={`${page}?try=${encodeURIComponent(verdict.qaTryId)}&step=${verdict.step}`}>
                  <span className={`vdot vdot--${verdict.passed ? 'verified' : 'failed'}`} />
                  <span className="qh-verdicts-text">
                    <span className="qh-muted">
                      {manyScenarios && `${verdict.ordinal} · `}
                      {copy.stepLabel(verdict.step)}
                    </span>{' '}
                    {verdict.detail.message}
                  </span>
                  {verdict.detail.status === 'uncertain' && (
                    <span className="qv-ev qv-ev--uncertain">{copy.evidence.uncertain}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {flagged.length > SHOWN && <Link className="qh-muted" to={page}>{copy.inspector.more(flagged.length - SHOWN)}</Link>}
        </>
      )}
    </section>
  )
}
