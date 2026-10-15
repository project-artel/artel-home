import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { InfoHint } from '../../design-system/primitives/InfoHint'
import { useI18n } from '../../i18n/useI18n'
import { formatDateTime } from '../../projects/formatters'
import { sectionHref } from '../../projects/workspace/sections'
import { qaRunPath } from '../qaTypes'
import type { SinceLastQa, SinceLastQaChange } from './qaLaunchApi'
import { CollapsibleSection } from './CollapsibleSection'

/**
 * "지난 실행 이후"(ARTEL-1084) — 고른 테스트 런의 마지막 실행에서 나온 이슈와, 그 뒤로 바뀐 것.
 *
 * 다시 돌릴지, 돌리면 무엇을 볼지를 정하는 자리다. 두 칸은 높이를 맞추고 칸마다 서비스 스크롤바
 * (`EdgeScrollbar`)를 단다 — 한쪽만 길어서 화면이 출렁이지 않게.
 *
 * 이슈에는 사진이 없다. 제목만 나열하고, 누르면 그 실행의 그 시나리오로 간다.
 */
export function SinceLastRun({
  projectId,
  runId,
  since,
  status,
  onManageConsoles,
}: {
  projectId: string
  runId: string
  since: SinceLastQa | null
  status: 'loading' | 'ready' | 'failed'
  onManageConsoles: () => void
}) {
  const { t } = useI18n()
  const l = t.qa.launch.since
  const last = since?.lastQaRun ?? null

  const header = last === null ? null : (
    <>
      <span className="ql-section-sub">
        {l.lastRun(
          formatDateTime(last.startedAt),
          last.casesPassed === null || last.casesTotal === null ? t.qa.statusLabels[last.status as keyof typeof t.qa.statusLabels] ?? last.status : `${last.casesPassed}/${last.casesTotal}`,
        )}
      </span>
      <span className="ql-spacer" />
      <Link className="ql-link" to={qaRunPath(projectId, last.id)}>{l.openLast}</Link>
    </>
  )

  return (
    <CollapsibleSection id="ql-since" title={l.title} extra={header}>
      {status === 'failed' && <p className="ql-empty">{l.loadFailed}</p>}
      {status === 'ready' && last === null && <p className="ql-empty">{l.never}</p>}
      {status === 'ready' && since !== null && last !== null && (
        <>
          <div className="ql-since-grid">
            <ScrollBox label={l.issuesTitle(since.issues.length)} title={l.issuesTitle(since.issues.length)} tone="bad">
              {since.issues.length === 0 ? (
                <p className="ql-empty">{l.noIssues}</p>
              ) : (
                <ul className="ql-rows">
                  {since.issues.map((issue) => (
                    <li key={issue.id}>
                      <Link className="ql-issue" to={qaRunPath(projectId, last.id, issue.qaTryId)}>
                        {issue.severity !== null && <span className={`ql-sev ql-sev--${issue.severity.toLowerCase()}`}>{t.issues.severityLabels[issue.severity as keyof typeof t.issues.severityLabels] ?? issue.severity}</span>}
                        <span className="ql-issue-title">{issue.title}</span>
                        <span className="ql-issue-meta">
                          {issue.scenarioTitle}
                          {issue.step !== null && ` · ${l.step(issue.step)}`}
                        </span>
                        <span className={'ql-issue-status' + (issue.status === 'RESOLVED' ? ' is-resolved' : '')}>
                          {t.issues.statusLabels[issue.status as keyof typeof t.issues.statusLabels] ?? issue.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollBox>
            <ScrollBox hint={l.changesHint} label={l.changesTitle} title={l.changesTitle} tone="neutral">
              {since.changes.length === 0 ? (
                <p className="ql-empty">{l.noChanges}</p>
              ) : (
                <ol className="ql-rows ql-timeline">
                  {since.changes.map((change, index) => (
                    <li key={`${change.kind}-${change.subjectId ?? index}`}>
                      <ChangeRow change={change} onManageConsoles={onManageConsoles} projectId={projectId} runId={runId} />
                    </li>
                  ))}
                </ol>
              )}
            </ScrollBox>
          </div>
          <label className="ql-failed-only">
            <input disabled type="checkbox" />
            <span>{l.failedOnly}</span>
            <InfoHint>{l.failedOnlyHint}</InfoHint>
          </label>
        </>
      )}
    </CollapsibleSection>
  )
}

/** 변경 한 줄. 갈 곳이 있는 것은 그리로 간다 — 빌드는 콘솔 관리, 시나리오는 스튜디오, 이슈는 이슈 화면. */
function ChangeRow({
  change,
  projectId,
  runId,
  onManageConsoles,
}: {
  change: SinceLastQaChange
  projectId: string
  runId: string
  onManageConsoles: () => void
}) {
  const { t } = useI18n()
  const l = t.qa.launch.since
  const name = change.subjectName ?? ''
  const text = change.kind === 'CASE_VERSION_ADDED' ? l.text.CASE_VERSION_ADDED(change.count) : l.text[change.kind](name)
  const body = (
    <>
      <span aria-hidden="true" className={`ql-tl-dot ql-tl-dot--${change.kind.toLowerCase()}`} />
      <span className="ql-tl-body">
        <span className="ql-tl-head">
          <span className="ql-tl-kind">{l.kinds[change.kind]}</span>
          <span className="ql-tl-at">{formatDateTime(change.at)}</span>
        </span>
        <span className="ql-tl-text">{text}</span>
      </span>
    </>
  )
  if (change.kind === 'BUILD_REPORTED') {
    return <button className="ql-tl-row" onClick={onManageConsoles} type="button">{body}</button>
  }
  const to =
    change.kind === 'ISSUE_RESOLVED'
      ? sectionHref(projectId, 'issues')
      : change.kind === 'CASE_VERSION_ADDED'
        ? sectionHref(projectId, 'test-cases')
        : `/projects/${encodeURIComponent(projectId)}/test-scenarios/${encodeURIComponent(change.subjectId ?? '')}?run=${encodeURIComponent(runId)}`
  return <Link className="ql-tl-row" to={to}>{body}</Link>
}

/** 높이가 정해진 칸 하나. 네이티브 스크롤바는 숨기고 서비스 스크롤바를 단다. */
function ScrollBox({
  title,
  label,
  tone,
  hint,
  children,
}: {
  title: string
  label: string
  tone: 'bad' | 'neutral'
  hint?: string
  children: ReactNode
}) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  return (
    <section className="ql-box" aria-label={label}>
      <h3 className={`ql-box-title ql-box-title--${tone}`}>
        {title}
        {hint !== undefined && <InfoHint>{hint}</InfoHint>}
      </h3>
      <div className="ql-box-frame">
        <div className="ql-box-scroll" ref={setScroller}>{children}</div>
        <EdgeScrollbar label={label} scroller={scroller} side="right" />
      </div>
    </section>
  )
}
