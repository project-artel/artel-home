import { useI18n } from '../i18n/useI18n'
import { QA_LOG_DIRECTIONS, QA_LOG_TYPES } from './qaTypes'
import type { QaLogFilter } from './qaLogFilter'
import './qaReplay.css'

export function QaRawLogControls({ filter, onFilter, query, onQuery, matches, current, onFind, hasMore, loading, onLoadOlder }: {
  filter: QaLogFilter
  onFilter: (filter: QaLogFilter) => void
  query: string
  onQuery: (query: string) => void
  matches: number
  current: number
  onFind: (direction: -1 | 1) => void
  hasMore: boolean
  loading: boolean
  onLoadOlder: () => void
}) {
  const { t } = useI18n()
  const copy = t.qa.rawLogs
  return <div className="qa-raw-controls">
    <label>{copy.filter}<input type="search" value={filter.text} onChange={(event) => onFilter({ ...filter, text: event.target.value })} /></label>
    <label>{copy.type}<select value={filter.type} onChange={(event) => onFilter({ ...filter, type: event.target.value as QaLogFilter['type'] })}>
      <option value="">{copy.all}</option>{QA_LOG_TYPES.map((type) => <option key={type}>{type}</option>)}
    </select></label>
    <label>{copy.direction}<select value={filter.direction} onChange={(event) => onFilter({ ...filter, direction: event.target.value as QaLogFilter['direction'] })}>
      <option value="">{copy.all}</option>{QA_LOG_DIRECTIONS.map((direction) => <option key={direction}>{direction}</option>)}
    </select></label>
    <label className="qa-raw-check"><input type="checkbox" checked={filter.includePulse} onChange={(event) => onFilter({ ...filter, includePulse: event.target.checked })} />{copy.includePulse}</label>
    <label>{copy.find}<input type="search" value={query} onChange={(event) => onQuery(event.target.value)} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); onFind(event.shiftKey ? -1 : 1) }
    }} /></label>
    <div className="qa-raw-find">
      <button type="button" className="button button--secondary" disabled={matches === 0} onClick={() => onFind(-1)} aria-label={copy.previous}>↑</button>
      <output aria-live="polite">{current < 0 ? 0 : current + 1} / {matches}</output>
      <button type="button" className="button button--secondary" disabled={matches === 0} onClick={() => onFind(1)} aria-label={copy.next}>↓</button>
    </div>
    {hasMore && <button type="button" className="button button--secondary" disabled={loading} onClick={onLoadOlder}>{copy.loadOlder}</button>}
  </div>
}
