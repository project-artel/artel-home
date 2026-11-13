import { InlineError } from '../../design-system/primitives/Feedback'
import { Button } from '../../design-system/primitives/Button'
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
      {failure !== null && <InlineError>{failure}</InlineError>}
      <div className="dialog-actions qa-version-choice-actions">
        <Button variant="primary" disabled={pending} onClick={onAdd} type="button">
          {pending ? copy.addingVersionCases : copy.addVersionAndRun}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onSkip} type="button">{copy.skipVersionAndRun}</Button>
        <Button variant="secondary" disabled={pending} onClick={onClose} type="button">{copy.cancelVersionChoice}</Button>
      </div>
    </Dialog>
  )
}
