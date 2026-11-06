import { Dialog } from '../../design-system/primitives/Dialog'
import { useI18n } from '../../i18n/useI18n'

export function RunVersionCasesDialog({ count, version, pending, failure, onClose, onAdd, onSkip }: {
  count: number
  version: string
  pending: boolean
  failure: string | null
  onClose: () => void
  onAdd: () => void
  onSkip: () => void
}) {
  const { t } = useI18n()
  const copy = t.qa.launch.panel
  return (
    <Dialog title={copy.versionChoiceTitle} labelledBy="qa-version-choice-title" onClose={() => { if (!pending) onClose() }}>
      <p className="dialog-copy">{copy.versionChoiceCopy(count, version)}</p>
      {failure !== null && <div className="inline-error" role="alert">{failure}</div>}
      <div className="dialog-actions qa-version-choice-actions">
        <button className="button button--primary" disabled={pending} onClick={onAdd} type="button">
          {pending ? copy.addingVersionCases : copy.addVersionAndRun}
        </button>
        <button className="button button--secondary" disabled={pending} onClick={onSkip} type="button">{copy.skipVersionAndRun}</button>
        <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">{copy.cancelVersionChoice}</button>
      </div>
    </Dialog>
  )
}
