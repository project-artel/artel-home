import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { FolderPicker } from './FolderPicker'
import type { FolderRow } from './testCaseFolders'

/** 폴더를 만들고, 이름을 바꾸고, 옮기는 세 동작이 같은 요청 모양(`name`, `parentId`)을 쓴다. */
export type FolderDialogMode = 'create' | 'rename' | 'move'

export type FolderDraft = { name: string; parentId: string | null }

/**
 * 폴더 dialog. 이름 칸은 만들기와 이름 변경에, 부모 칸은 만들기와 이동에 나온다.
 *
 * 서버의 409(같은 부모 아래 같은 이름)와 400(자기나 하위 폴더 밑으로 이동)은 dialog 안에서
 * 그 이유를 말한다. 닫고 나서 알려 주면 무엇을 고쳐야 하는지 알 수 없다.
 */
export function FolderDialog({
  initial,
  mode,
  onClose,
  onSubmit,
  parentRows,
}: {
  initial: FolderDraft
  mode: FolderDialogMode
  onClose: () => void
  onSubmit: (draft: FolderDraft) => Promise<void>
  /** 부모로 고를 수 있는 폴더. 이동이면 자기와 하위 폴더는 이미 빠져 있다. */
  parentRows: readonly FolderRow[]
}) {
  const { t } = useI18n()
  const m = t.testCases.folders.dialog
  const titleId = useId()
  const nameId = useId()
  const parentId = useId()
  const [name, setName] = useState(initial.name)
  const [parent, setParent] = useState<string | null>(initial.parentId)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const isUnchanged = mode !== 'create' && name.trim() === initial.name && parent === initial.parentId
  const showsName = mode !== 'move'
  const showsParent = mode !== 'rename'

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = name.trim()
    if (showsName && trimmed.length === 0) {
      setFailure(m.nameRequired)
      return
    }

    setPending(true)
    setFailure(null)
    try {
      await onSubmit({ name: trimmed, parentId: parent })
    } catch (error: unknown) {
      setFailure(toFailureMessage(error, m))
      setPending(false)
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title[mode]}>
      <form className="form" onSubmit={(event) => void submit(event)}>
        {showsName && (
          <div className="field">
            <label className="field-label" htmlFor={nameId}>{m.name}</label>
            <input
              autoComplete="off"
              className="field-input"
              id={nameId}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
        )}
        {showsParent && (
          <div className="field">
            <label className="field-label" htmlFor={parentId}>{m.parent}</label>
            <FolderPicker
              id={parentId}
              noneLabel={m.topLevel}
              onChange={setParent}
              rows={parentRows}
              value={parent}
            />
          </div>
        )}

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
          <button className="button button--primary" disabled={pending || isUnchanged} type="submit">
            {pending ? m.pending : m.submit[mode]}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function toFailureMessage(
  error: unknown,
  m: { duplicateName: string; invalidLocation: string; failed: string },
): string {
  if (error instanceof ProjectApiError) {
    if (error.status === 409) return m.duplicateName
    if (error.status === 400) return m.invalidLocation
  }
  return m.failed
}
