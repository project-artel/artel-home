import { useI18n } from '../../i18n/useI18n'

import { TOOL_KEYS, type RunMapTool } from './runMapTools'

const ICONS: Record<RunMapTool, string> = {
  select: 'M5 3l14 8-6 2-2 6z',
  hand: 'M8 13V5.5a1.5 1.5 0 013 0V12m0-6.5a1.5 1.5 0 013 0V12m0-5a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L3.5 13a1.5 1.5 0 012.5-1.6L8 14',
  ts: 'M3 7a3 3 0 013-3h12a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3zM7 12h2m3 0h2',
  note: 'M5 4h14v10l-5 6H5zM14 20v-6h5',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  rect: 'M6 6h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z',
  ellipse: 'M4 12a8 6 0 1016 0 8 6 0 10-16 0',
  section: 'M3 8V6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 8h18',
  arrow: 'M4 18L19 5M12 5h7v7',
  pen: 'M4 20c3-1 4-4 7-7l6-6 3 3-6 6c-3 3-6 4-7 7z',
}
const ORDER: RunMapTool[] = ['select', 'hand', 'ts', 'note', 'text', 'rect', 'ellipse', 'section', 'arrow', 'pen']
const KEY_OF = Object.fromEntries(Object.entries(TOOL_KEYS).map(([k, v]) => [v, k.toUpperCase()])) as Record<RunMapTool, string>

/** 캔버스 위 가운데 툴바. */
export function RunMapToolbar({
  tool,
  onTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  tool: RunMapTool
  onTool: (tool: RunMapTool) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const { t } = useI18n()
  const m = t.scenarios.map.tools
  return (
    <div aria-label={m.label} className="rm-toolbar" role="toolbar">
      {ORDER.map((one) => (
        <button
          aria-pressed={tool === one}
          className={'rm-tool' + (one === 'ts' ? ' rm-tool--primary' : '') + (one === 'ts' || one === 'note' ? ' rm-tool--wide' : '')}
          key={one}
          onClick={() => onTool(one)}
          title={`${m[one]} (${KEY_OF[one]})`}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d={ICONS[one]} /></svg>
          {(one === 'ts' || one === 'note') && <span>{m[one]}</span>}
          <span className="visually-hidden">{m[one]}</span>
        </button>
      ))}
      <span className="rm-tool-sep" />
      <button className="rm-tool" disabled={!canUndo} onClick={onUndo} title={`${m.undo} (⌘Z)`} type="button">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" /></svg>
        <span className="visually-hidden">{m.undo}</span>
      </button>
      <button className="rm-tool" disabled={!canRedo} onClick={onRedo} title={`${m.redo} (⇧⌘Z)`} type="button">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" /></svg>
        <span className="visually-hidden">{m.redo}</span>
      </button>
    </div>
  )
}
