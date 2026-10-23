import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { actionLabel, earlierIssue, textParts, type StepRow } from './verdictModel'

const ICONS = {
  checks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  reason: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z',
  actions: 'M5 3l14 8-6 2-2 6z',
  issue: 'M12 3l10 18H2zM12 10v4M12 17.5v.5',
  captures: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
} as const

/** 섹션 머리: 색 바탕의 아이콘과 굵은 라벨. QA 히스토리 상세의 묶음 머리와 같은 모양이다. */
function SectionTitle({ kind, children }: { kind: keyof typeof ICONS; children: ReactNode }) {
  return (
    <h3 className="qv-sec-title">
      <span aria-hidden="true" className={`qv-ico qv-ico--${kind}`}>
        <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
          <path d={ICONS[kind]} />
        </svg>
      </span>
      {children}
    </h3>
  )
}

/** 백틱으로 감싼 코드 이름은 코드 칩으로. */
function CodeText({ text }: { text: string }) {
  return (
    <>
      {textParts(text).map((part, index) =>
        part.code ? <code className="qv-ic" key={index} translate="no">{part.text}</code> : <span key={index}>{part.text}</span>,
      )}
    </>
  )
}

/**
 * 고른 스텝 하나의 근거. 기대와 실제를 나란히 두고, 그 아래 기대 항목별 근거와 판독 기록 대조, 판정한 이유,
 * 그 스텝에서 한 행동, 앞선 이슈, 스크린샷. 판정 전 스텝은 기대만 있다.
 */
export function StepDetail({ projectId, row, rows }: { projectId: string; row: StepRow; rows: StepRow[] }) {
  const { t } = useI18n()
  const copy = t.qa.verdicts
  const d = copy.detail
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const verdict = row.verdict
  const issue = earlierIssue(rows, row.step)
  const pill = verdict === null ? (row.state === 'running' ? 'running' : 'pending') : verdict.passed ? 'passed' : 'failed'

  return (
    <section aria-label={copy.step(row.step)} className="qv-detail">
      <div className="qv-detail-scroll" ref={setScroller}>
        <div className="qv-detail-head">
          <div className="qv-detail-meta">
            <span className="qv-stepchip mono">{copy.step(row.step)}</span>
            <span className={`qv-pill qv-pill--${pill}`}>
              <span aria-hidden="true" className="qv-dot" />
              {copy.states[row.state]}
            </span>
            {verdict !== null ? (
              row.verifying && <span className={`qv-ev qv-ev--${verdict.detail.status}`}>{copy.evidence[verdict.detail.status]}</span>
            ) : (
              <span className="qv-ev qv-ev--none">{copy.waiting}</span>
            )}
          </div>
          <h2 className="qv-detail-title"><CodeText text={row.title} /></h2>
        </div>

        <div className="qv-cmp">
          <div className="qv-cmp-exp">
            <span className="qv-cmp-label">{d.expected}</span>
            <span className="qv-cmp-text">{row.expected === null ? <span className="qv-muted">{d.none}</span> : <CodeText text={row.expected} />}</span>
          </div>
          <div className={`qv-cmp-act qv-cmp-act--${pill}`}>
            <span className="qv-cmp-label">{d.actual}</span>
            <span className="qv-cmp-text">{verdict === null ? <span className="qv-muted">{d.notYet}</span> : verdict.detail.message}</span>
          </div>
        </div>

        {verdict !== null && verdict.detail.checks.length > 0 && (
          <div className="qv-sec">
            <SectionTitle kind="checks">{d.checks}</SectionTitle>
            <table className="qv-checks">
              <colgroup><col style={{ width: '30%' }} /><col style={{ width: '26%' }} /><col style={{ width: 96 }} /><col /></colgroup>
              <thead>
                <tr><th>{d.columns.item}</th><th>{d.columns.actual}</th><th>{d.columns.met}</th><th>{d.columns.source}</th></tr>
              </thead>
              <tbody>
                {verdict.detail.checks.map((check, index) => (
                  <tr key={index}>
                    <td><CodeText text={check.expected} /></td>
                    <td className="qv-muted-text">{check.observed}</td>
                    <td><span className={`qv-met qv-met--${check.met}`}>{d.met[check.met]}</span></td>
                    <td>
                      {check.sources.map((source, sourceIndex) => (
                        <div className="qv-source" key={sourceIndex}>
                          <code translate="no">{source.key ?? source.kind}{source.value !== null && ` = ${source.value}`}</code>
                          <span className={`qv-cit qv-cit--${source.citation}`}>{d.citation[source.citation]}</span>
                          {source.citation === 'mismatch' && source.recorded !== null && (
                            <code className="qv-recorded" translate="no">{d.recorded(source.recorded)}</code>
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {verdict?.detail.reason != null && (
          <div className="qv-sec">
            <SectionTitle kind="reason">{d.reason}</SectionTitle>
            <p className="qv-quote">{verdict.detail.reason}</p>
          </div>
        )}

        <div className="qv-sec">
          <SectionTitle kind="actions">{d.actions}</SectionTitle>
          {verdict === null || verdict.actions.length === 0 ? (
            <span className="qv-muted">{d.none}</span>
          ) : (
            <div className="qv-acts">
              {verdict.actions.map((action, index) => (
                <span className="qv-act mono" key={index}>{actionLabel(action, d)}</span>
              ))}
            </div>
          )}
        </div>

        {issue !== null && (
          <div className="qv-sec">
            <SectionTitle kind="issue">{issue.step === row.step ? d.thisIssue : d.issue}</SectionTitle>
            <Link className="qv-issue" to={`/projects/${encodeURIComponent(projectId)}/issues?issue=${encodeURIComponent(issue.issueId)}`}>
              <span className="qv-issue-sev mono">{issue.severity}</span>
              <span className="qv-issue-body">
                <b>{issue.title}</b>
                <span className="qv-muted">{copy.step(issue.step)}</span>
              </span>
              <span className="qv-muted">{d.openIssue}</span>
            </Link>
          </div>
        )}

        <div className="qv-sec">
          <SectionTitle kind="captures">{d.captures}</SectionTitle>
          {verdict === null || verdict.captures.length === 0 ? (
            <span className="qv-muted">{d.none}</span>
          ) : (
            <div className="qv-captures">
              {verdict.captures.map((capture) => (
                <a href={capture.url} key={capture.captureId} rel="noreferrer" target="_blank">
                  <img alt={capture.captureId} loading="lazy" src={capture.url} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <EdgeScrollbar label={copy.step(row.step)} scroller={scroller} side="right" />
    </section>
  )
}
