import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { FolderPicker } from './FolderPicker'
import type { FolderRow } from './testCaseFolders'

/** 선택한 test case 를 한 폴더(또는 폴더 없음)로 옮기는 dialog. 성공하면 부른 쪽이 닫는다. */
export function MoveCasesDialog({
  count,
  initialFolderId,
  onClose,
  onConfirm,
  rows,
}: {
  count: number
  initialFolderId: string | null
  onClose: () => void
  onConfirm: (folderId: string | null) => Promise<void>
  rows: readonly FolderRow[]
}) {
  const { t } = useI18n()
  const m = t.testCases.moveCases
  const titleId = useId()
  const pickerId = useId()
  const [folderId, setFolderId] = useState<string | null>(initialFolderId)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setFailure(null)
    try {
      await onConfirm(folderId)
    } catch {
      setFailure(m.failed)
      setPending(false)
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title(count)}>
      <form className="form" onSubmit={(event) => void confirm(event)}>
        <div className="field">
          <label className="field-label" htmlFor={pickerId}>{m.destination}</label>
          <FolderPicker
            id={pickerId}
            noneLabel={m.noFolder}
            onChange={setFolderId}
            rows={rows}
            value={folderId}
          />
        </div>

        {failure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}

        <div className="dialog-actions">
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">
            {m.cancel}
          </button>
          <button className="button button--primary" disabled={pending} type="submit">
            {pending ? m.pending : m.confirm(count)}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
