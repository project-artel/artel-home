import { useId, useMemo, useState } from 'react'
import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { diffLines, foldUnchanged } from './lineDiff'
import { qaChangeKey, revertQaChange, type QaChange } from './qaChangeApi'
import type { QaRunChanges } from './useQaRunChanges'

/** Each change as a line diff with a revert button. */
export function QaRunChangesPanel({ changes, qaRunId }: { changes: QaRunChanges; qaRunId: string }) {
  const { t } = useI18n()
  const { items, state, reload, replaceItem } = changes
  const [reverting, setReverting] = useState<QaChange | null>(null)

  async function confirmRevert(change: QaChange) {
    try {
      replaceItem(await revertQaChange(qaRunId, change))
      setReverting(null)
    } catch (error: unknown) {
      // The item may have been superseded since it was loaded; show its new state.
      if (error instanceof ProjectApiError && error.status === 409) reload()
      throw error
    }
  }

  function failureMessage(error: unknown): string {
    if (error instanceof ProjectApiError && error.status === 409 && error.message.length > 0) {
      return error.message
    }
    return t.qa.changes.revertFailed
  }

  return (
    <section className="qa-changes" aria-label={t.qa.changes.heading}>
      {state === 'loading' && <p className="panel-empty">{t.qa.changes.loading}</p>}
      {state === 'error' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {t.qa.changes.loadFailed}
          <button className="button button--secondary button--compact" onClick={reload} type="button">
            {t.qa.changes.retry}
          </button>
        </div>
      )}
      {state === 'ready' && items.length === 0 && <p className="panel-empty">{t.qa.changes.empty}</p>}
      {state === 'ready' && items.length > 0 && (
        <ul className="qa-changes-list">
          {items.map((item) => (
            <li key={qaChangeKey(item)}>
              <QaChangeItem item={item} onRevert={() => setReverting(item)} />
            </li>
          ))}
        </ul>
      )}

      {reverting !== null && (
        <ConfirmActionDialog
          body={
            <>
              {t.qa.changes.revertBody(reverting.name)}
              {revertEffect(reverting, t.qa.changes)}
            </>
          }
          cancelLabel={t.qa.changes.cancel}
          confirmLabel={t.qa.changes.revert}
          onClose={() => setReverting(null)}
          onConfirm={() => confirmRevert(reverting)}
          pendingLabel={t.qa.changes.reverting}
          title={t.qa.changes.revertTitle}
          toFailureMessage={failureMessage}
        />
      )}
    </section>
  )
}

function revertEffect(
  change: QaChange,
  messages: { revertCreate: string; revertUpdate: string; revertDelete: string },
): string {
  if (change.change === 'CREATE') return messages.revertCreate
  if (change.change === 'DELETE') return messages.revertDelete
  return messages.revertUpdate
}

function QaChangeItem({ item, onRevert }: { item: QaChange; onRevert: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const reverted = item.decision === 'REVERTED'

  return (
    <article className={`qa-change qa-change--${item.change.toLowerCase()}${reverted ? ' qa-change--reverted' : ''}`}>
      <header className="qa-change-head">
        <button
          aria-controls={bodyId}
          aria-expanded={open}
          className="qa-change-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span aria-hidden="true" className="qa-changes-caret">{open ? '▾' : '▸'}</span>
          <span className="qa-change-kind">{t.qa.changes.kind[item.kind]}</span>
          <span className={`qa-change-type qa-change-type--${item.change.toLowerCase()}`}>
            {t.qa.changes.change[item.change]}
          </span>
          <span className="qa-change-name">{item.name}</span>
          {reverted && <span className="qa-change-state">{t.qa.changes.reverted}</span>}
        </button>
        {item.revertible && (
          <button className="button button--secondary button--compact" onClick={onRevert} type="button">
            {t.qa.changes.revert}
          </button>
        )}
        {!item.revertible && !reverted && item.notRevertibleReason !== null && (
          <span className="qa-change-reason">{t.qa.changes.notRevertible[item.notRevertibleReason]}</span>
        )}
      </header>
      <div className="qa-change-body" hidden={!open} id={bodyId}>
        {open && <LineDiffView after={item.after} before={item.before} label={t.qa.changes.diffLabel(item.name)} />}
      </div>
    </article>
  )
}

const CONTEXT_LINES = 3
const MARKERS = { add: '+', remove: '-', context: ' ' } as const

function LineDiffView({ after, before, label }: { after: string | null; before: string | null; label: string }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const rows = useMemo(() => foldUnchanged(diffLines(before, after), CONTEXT_LINES), [after, before])

  if (rows.length === 0) return <p className="panel-empty">{t.qa.changes.noLineChange}</p>

  return (
    <div aria-label={label} className="qa-diff" role="group">
      {rows.map((row, index) => {
        if (row.kind !== 'fold') {
          return (
            <div className={`qa-diff-line qa-diff-line--${row.kind}`} key={index}>
              <span className="qa-diff-marker">{MARKERS[row.kind]}</span>
              <span className="qa-diff-text">{row.text}</span>
            </div>
          )
        }
        if (!expanded.has(index)) {
          return (
            <button
              className="qa-diff-fold"
              key={index}
              onClick={() => setExpanded((current) => new Set(current).add(index))}
              type="button"
            >
              {t.qa.changes.foldedLines(row.lines.length)}
            </button>
          )
        }
        return row.lines.map((line, offset) => (
          <div className="qa-diff-line qa-diff-line--context" key={`${index}:${offset}`}>
            <span className="qa-diff-marker">{MARKERS.context}</span>
            <span className="qa-diff-text">{line.text}</span>
          </div>
        ))
      })}
    </div>
  )
}
