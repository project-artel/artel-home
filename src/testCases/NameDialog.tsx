import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'

/**
 * 이름 하나를 받는 dialog(ARTEL-1024). 버전 묶음을 만들고 이름을 바꿀 때 쓴다. 같은 이름(409)은 dialog 안에서
 * 말한다 — 닫고 나서 알려 주면 무엇을 고쳐야 하는지 알 수 없다.
 */
export function NameDialog({
  initialName,
  onClose,
  onSubmit,
  messages,
  submitLabel,
  title,
}: {
  /** 이 이름이 무엇의 이름인지에 맞춘 오류 문장. 폴더 문장을 빌려 쓰면 묶음 dialog 에 "폴더" 가 떴다. */
  messages: { nameRequired: string; duplicateName: string; invalidName: string; failed: string }
  initialName: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
  submitLabel: string
  title: string
}) {
  const { t } = useI18n()
  const m = { ...t.testCases.folders.dialog, ...messages }
  const titleId = useId()
  const nameId = useId()
  const [name, setName] = useState(initialName)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setFailure(m.nameRequired)
      return
    }
    setPending(true)
    setFailure(null)
    try {
      await onSubmit(trimmed)
    } catch (error: unknown) {
      setFailure(
        error instanceof ProjectApiError && error.status === 409
          ? m.duplicateName
          : error instanceof ProjectApiError && error.status === 400
            ? m.invalidName
            : m.failed,
      )
      setPending(false)
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={title}>
      <form className="form" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label className="field-label" htmlFor={nameId}>{m.name}</label>
          <input
            autoComplete="off"
            className="field-input"
            id={nameId}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            value={name}
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
          <button
            className="button button--primary"
            // 이름을 바꾸는데 그대로면 누를 것이 없다. 비었을 때는 눌러서 왜 안 되는지 듣게 둔다.
            disabled={pending || (initialName.trim().length > 0 && name.trim() === initialName.trim())}
            type="submit"
          >
            {pending ? m.pending : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
