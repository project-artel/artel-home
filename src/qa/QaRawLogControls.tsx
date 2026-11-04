import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { QA_LOG_DIRECTIONS, QA_LOG_TYPES } from './qaTypes'
import { DEFAULT_QA_LOG_FILTER, type QaLogFilter } from './qaLogFilter'
import './qaReplay.css'

export function QaRawLogControls({ filter, onFilter, query, onQuery, matches, current, onFind }: {
  filter: QaLogFilter; onFilter: (filter: QaLogFilter) => void
  query: string; onQuery: (query: string) => void; matches: number; current: number
  onFind: (direction: -1 | 1) => void
}) {
  const { t } = useI18n()
  const copy = t.qa.rawLogs
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const changed = filter.type !== '' || filter.direction !== '' || filter.includePulse
  return <div className="qa-raw-controls" ref={root} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
    <div className="qa-log-search-row">
      <div className="qa-log-search-field">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input type="search" aria-label={copy.search} placeholder={copy.search} value={query} onChange={event => {
          onQuery(event.target.value)
          onFilter({ ...filter, text: event.target.value })
        }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onFind(event.shiftKey ? -1 : 1) } }} />
        {query.trim() && <><output className="mono" aria-live="polite">{current < 0 ? 0 : current + 1}/{matches}</output><button type="button" className="qa-icon-button" disabled={matches === 0} onClick={() => onFind(-1)} aria-label={copy.previous}>↑</button><button type="button" className="qa-icon-button" disabled={matches === 0} onClick={() => onFind(1)} aria-label={copy.next}>↓</button></>}
      </div>
      <button type="button" className={`qa-log-filter-toggle${changed ? ' qa-log-filter-toggle--active' : ''}`} aria-label={copy.filters} title={copy.filters} aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 5h16l-6 7v6l-4 2v-8z" /></svg>
      </button>
    </div>
    {open && <div className="qa-log-filter-popover" role="group" aria-label={copy.filters}>
      <header><strong>{copy.filters}</strong><button type="button" className="qa-icon-button" aria-label={copy.reset} onClick={() => { onQuery(''); onFilter(DEFAULT_QA_LOG_FILTER) }}>↺</button></header>
      <div className="qa-log-filter-selects">
        <label>{copy.type}<select value={filter.type} onChange={event => onFilter({ ...filter, type: event.target.value as QaLogFilter['type'] })}><option value="">{copy.all}</option>{QA_LOG_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <label>{copy.direction}<select value={filter.direction} onChange={event => onFilter({ ...filter, direction: event.target.value as QaLogFilter['direction'] })}><option value="">{copy.all}</option>{QA_LOG_DIRECTIONS.map(direction => <option key={direction}>{direction}</option>)}</select></label>
      </div>
      <label className="qa-raw-check"><input type="checkbox" checked={filter.includePulse} onChange={event => onFilter({ ...filter, includePulse: event.target.checked })} />{copy.includePulse}</label>
    </div>}
  </div>
}
