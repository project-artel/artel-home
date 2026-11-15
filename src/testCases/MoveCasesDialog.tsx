import { TextInput } from '../design-system/primitives/Fields'
import { Button } from '../design-system/primitives/Button'
import { InlineError } from '../design-system/primitives/Feedback'
import { useId, useState } from 'react'
import { SketchEmpty } from '../emptyStates/SketchEmpty'
import { FolderSketch } from '../emptyStates/sketches'
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
  onCreateFolder,
}: {
  /**
   * 담을 폴더가 하나도 없을 때 이 창에서 바로 만든다(ARTEL-1378). 주면 빈 화면에 이름 칸과 만들기 단추가 서고, 만든
   * 폴더가 [rows] 로 돌아오면 고르기 칸이 선다.
   */
  onCreateFolder?: (name: string) => Promise<void>
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
  const allowsNone = mode === 'move'
  const [folderId, setFolderId] = useState<string | null>(
    allowsNone || rows.some((row) => row.folder.id === initialFolderId)
      ? initialFolderId
      : (rows[0]?.folder.id ?? null),
  )
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // 폴더가 없으면 고르기 칸을 그리지 않는다. 빈 고르기 칸은 펼쳐진 채 단추를 덮었다.
  const empty = !allowsNone && rows.length === 0
  if (folderId === null && !allowsNone && rows.length > 0) setFolderId(rows[0].folder.id)

  async function createFolder() {
    const name = newName.trim()
    if (onCreateFolder === undefined || name.length === 0) return
    setCreating(true)
    setFailure(null)
    try {
      await onCreateFolder(name)
      setNewName('')
    } catch {
      setFailure(items.createFailed)
    } finally {
      setCreating(false)
    }
  }

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
        {empty ? (
          <SketchEmpty
            actions={
              onCreateFolder !== undefined && mode === 'add' ? (
                <span className="move-cases-create">
                  <TextInput
                    aria-label={items.newFolderName}
                    disabled={creating}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void createFolder()
                      }
                    }}
                    placeholder={items.newFolderName}
                    value={newName}
                  />
                  <Button
                    variant="secondary"
                    disabled={creating || newName.trim().length === 0}
                    onClick={() => void createFolder()}
                    type="button"
                  >
                    {items.createFolder}
                  </Button>
                </span>
              ) : undefined
            }
            compact
            sketch={<FolderSketch />}
            surface
            title={mode === 'add' ? items.noFolders : items.noOtherFolders}
          />
        ) : (
          <div className="field">
            <FolderPicker
              label={m.destination}
              noneLabel={allowsNone ? m.noFolder : undefined}
              onChange={setFolderId}
              rows={rows}
              value={folderId}
            />
          </div>
        )}

        {failure !== null && (
          <InlineError>
            <span aria-hidden="true">!</span>
            {failure}
          </InlineError>
        )}

        <div className="dialog-actions">
          <Button variant="secondary" disabled={pending} onClick={onClose} type="button">
            {m.cancel}
          </Button>
          <Button variant="primary" disabled={pending || (!allowsNone && folderId === null)} type="submit">
            {pending ? m.pending : m.confirm(count)}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
