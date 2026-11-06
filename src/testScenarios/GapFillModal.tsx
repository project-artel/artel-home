import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { createHumanStep, type ScenarioStep } from './scenarioTypes'

/**
 * Fills a gap: the place where the scene spec could not say how to get from one
 * check to the next (ARTEL-468).
 *
 * Several rows, not one. A gap is one *question* ("how do you get there"), and the
 * answer is often several actions — the spec, when it does know a route, hands back
 * a list too. Forcing one line would push the user to write "walk over and press
 * start", which reads fine and runs as nothing.
 *
 * Confirming replaces the notice with the steps. The block exists to ask; once it is
 * answered it should not stay on the screen repeating the question. The steps are
 * marked as the user's own so the server keeps them verbatim.
 */
export function GapFillModal({
  blockedBy,
  detail,
  onCancel,
  onConfirm,
}: {
  blockedBy: string | null
  detail: string
  onCancel: () => void
  onConfirm: (steps: ScenarioStep[]) => void
}) {
  const { t } = useI18n()
  const e = t.scenarios.stepsEditor
  const [rows, setRows] = useState<string[]>([''])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const written = rows.map((row) => row.trim()).filter((row) => row.length > 0)

  function confirm() {
    if (written.length === 0) return
    onConfirm(written.map((action) => ({ ...createHumanStep(), action })))
  }

  return (
    <div className="tc-modal-scrim" onClick={(ev) => { if (ev.target === ev.currentTarget) onCancel() }}>
      <div className="tc-modal gapfill" role="dialog" aria-modal="true" aria-labelledby="gapfill-title">
        <div className="tc-modal-head">
          <h3 id="gapfill-title" className="tc-modal-title">{e.gapFillTitle}</h3>
          <button className="tc-modal-close" aria-label={e.gapFillCancel} onClick={onCancel} type="button">✕</button>
        </div>
        <div className="tc-modal-body">
          {blockedBy !== null && <p className="gapfill-where mono">{blockedBy}</p>}
          <p className="gapfill-detail">{detail}</p>

          <ol className="gapfill-rows">
            {rows.map((row, index) => (
              <li key={index} className="gapfill-row">
                <span className="gapfill-no mono">{index + 1}</span>
                <input
                  className="gapfill-input"
                  value={row}
                  autoFocus={index === 0}
                  placeholder={e.actionPlaceholder}
                  aria-label={`${e.actionLabel} ${index + 1}`}
                  onChange={(ev) =>
                    setRows(rows.map((value, i) => (i === index ? ev.target.value : value)))
                  }
                />
                <button
                  className="iconbtn iconbtn--danger"
                  type="button"
                  title={e.remove}
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >✕</button>
              </li>
            ))}
          </ol>

          <button className="gapfill-more" type="button" onClick={() => setRows([...rows, ''])}>
            ＋ {e.gapAddStep}
          </button>

          <div className="gapfill-actions">
            <button className="gapfill-cancel" type="button" onClick={onCancel}>{e.gapFillCancel}</button>
            <button
              className="gapfill-confirm"
              type="button"
              disabled={written.length === 0}
              onClick={confirm}
            >{e.gapFillConfirm}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
