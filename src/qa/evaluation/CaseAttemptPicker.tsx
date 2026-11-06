import { useTestCaseLabel, useTestCaseIdentifiers } from '../../testCases/testCaseIdentifiers'
import { useEffect, useRef } from 'react'
import { shortWhen } from '../history/historyModel'
import type { Attempt } from './evaluationApi'
import type { evaluationCopy } from './evaluationCopy'
import { groupCaseAttempts } from './caseAttemptGroups'

type Copy = typeof evaluationCopy.ko

function outcome(row: Attempt, copy: Copy) {
  return `${row.verdict ? copy[row.verdict] : copy.running} → ${row.review ? copy[row.review] : copy.unreviewed}`
}

export function CaseAttemptPicker({ id, options, current, onSelect, copy }: {
  id: string; options: Attempt[]; current: Attempt; onSelect: (id: string) => void; copy: Copy
}) {
  const caseLabel = useTestCaseLabel()
  const { numbers } = useTestCaseIdentifiers()
  const rail = useRef<HTMLDivElement>(null)
  const groups = groupCaseAttempts(options, numbers)
  const attempts = groups.find(([caseId]) => caseId === current.testCaseId)?.[1] ?? []
  const caseIds = groups.map(([caseId]) => caseId).join(':')

  useEffect(() => {
    const container = rail.current
    const selected = container?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!container || !selected) return
    const left = selected.offsetLeft
    const right = left + selected.offsetWidth
    if (left < container.scrollLeft) container.scrollLeft = left
    else if (right > container.scrollLeft + container.clientWidth) container.scrollLeft = right - container.clientWidth
  }, [current.testCaseId, caseIds])

  return <div className="qe-attempt-picker">
    <div className="qe-case-tabs" role="tablist" aria-label={copy.title} ref={rail} onKeyDown={event => {
      const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      const index = tabs.indexOf(event.target as HTMLButtonElement)
      if (index < 0) return
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
      if (next < 0) return
      event.preventDefault()
      tabs[next].focus({ preventScroll: true })
      tabs[next].click()
    }}>
      {groups.map(([caseId, rows]) => {
        const selected = caseId === current.testCaseId
        const row = selected ? current : rows[0]
        const label = `${caseLabel(caseId)} · ${outcome(row, copy)}`
        return <button type="button" role="tab" key={caseId} id={`${id}-case-${caseId}`} aria-controls={`${id}-panel`}
          aria-selected={selected} tabIndex={selected ? 0 : -1} aria-label={label}
          className="qe-case-tab" title={row.caseSnapshot?.step ?? label}
          onClick={() => { if (!selected) onSelect(rows[0].id) }}>
          <span className="qe-case-tab-head"><span className="mono">{caseLabel(caseId)}</span>
            <span aria-hidden="true" className={`qe-case-glyph qe-case-glyph--${row.verdict ?? 'running'}`}>
              {row.verdict === 'PASSED' ? '✓' : row.verdict === 'FAILED' ? '✕' : row.verdict === null ? '◐' : '?'}
            </span>
          </span>
          {row.caseSnapshot?.step && <span className="qe-case-tab-title">{row.caseSnapshot.step}</span>}
          <span className="qe-case-tab-status">{outcome(row, copy)}</span>
        </button>
      })}
    </div>
    {attempts.length > 1 && <div className="qe-attempt-history">
      <span className="qe-meta">{copy.attempt}</span>
      <div className="qe-attempt-options" role="group" aria-label={copy.attempt}>
        {attempts.map(row => <button key={row.id} type="button" className="qe-attempt-option"
          aria-pressed={row.id === current.id} onClick={() => onSelect(row.id)}>
          <span className="mono">{shortWhen(row.startedAt ?? row.createdAt)}</span> · {outcome(row, copy)}
        </button>)}
      </div>
    </div>}
  </div>
}
