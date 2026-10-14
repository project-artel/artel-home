import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { FolderPicker } from './FolderPicker'
import type { FolderRow } from './testCaseFolders'

/**
 * 선택한 test case 의 폴더를 고르는 dialog. 성공하면 부른 쪽이 닫는다.
 *
 * - `move`: 예전 단일 폴더 옮기기. 케이스를 모든 폴더에서 빼고 고른 폴더(또는 폴더 없음)에 넣는다.
 * - `add`: 고른 폴더에 담는다. 다른 폴더의 항목은 그대로다(ARTEL-1024).
 * - `moveItems`: 지금 폴더에서 고른 폴더로 옮긴다(ARTEL-1024).
 *
 * `add` 와 `moveItems` 는 폴더 없음을 고를 수 없다.
 */
export function MoveCasesDialog({
  count,
  initialFolderId,
  mode = 'move',
  onClose,
  onConfirm,
  rows,
}: {
  count: number
  initialFolderId: string | null
  mode?: 'move' | 'add' | 'moveItems'
  onClose: () => void
  onConfirm: (folderId: string | null) => Promise<void>
  rows: readonly FolderRow[]
}) {
  const { t } = useI18n()
  const moveLabels = t.testCases.moveCases
  const items = t.testCases.folderItems
  const m =
    mode === 'add'
      ? { ...moveLabels, title: items.addTitle, destination: items.destination, confirm: items.addConfirm, pending: items.addPending, failed: items.addFailed }
      : moveLabels
  const titleId = useId()
  const pickerId = useId()
  const allowsNone = mode === 'move'
  const [folderId, setFolderId] = useState<string | null>(
    allowsNone || rows.some((row) => row.folder.id === initialFolderId)
      ? initialFolderId
      : (rows[0]?.folder.id ?? null),
  )
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
            noneLabel={allowsNone ? m.noFolder : undefined}
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
          <button className="button button--primary" disabled={pending || (!allowsNone && folderId === null)} type="submit">
            {pending ? m.pending : m.confirm(count)}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
