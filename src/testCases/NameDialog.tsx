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
  submitLabel,
  title,
}: {
  initialName: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
  submitLabel: string
  title: string
}) {
  const { t } = useI18n()
  const m = t.testCases.folders.dialog
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
      setFailure(error instanceof ProjectApiError && error.status === 409 ? m.duplicateName : m.failed)
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
            disabled={pending || name.trim() === initialName.trim()}
            type="submit"
          >
            {pending ? m.pending : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
