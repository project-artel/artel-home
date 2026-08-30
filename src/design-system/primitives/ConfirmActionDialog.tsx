import { useId, useState, type ReactNode } from 'react'
import { Dialog } from './Dialog'

/**
 * 되돌릴 수 없는 동작 하나를 묻고, 눌린 뒤의 실패까지 그 자리에서 말하는 dialog.
 *
 * 프로젝트 삭제, 게임 인스턴스 삭제, 멤버 내보내기가 같은 모양을 쓴다. 셋이 다른 것은 부르는 API 와
 * 문구뿐이라, 각자 상태 관리와 버튼 배치를 한 벌씩 갖고 있을 이유가 없다.
 *
 * 지키는 것 둘.
 *
 * - **취소가 먼저 온다.** [Dialog] 가 열릴 때 첫 focusable 에 focus 를 주므로, 순서를 뒤집으면
 *   되돌릴 수 없는 버튼이 처음부터 focus 를 갖는다. `Enter` 한 번에 지워진다는 뜻이다.
 * - **성공에서 [pending] 을 되돌리지 않는다.** 성공하면 부른 쪽이 이 dialog 를 unmount 하므로,
 *   `finally` 로 정리하면 이미 사라진 컴포넌트의 상태를 건드린다.
 *
 * @property body 무엇을 지우는지 이름을 실어 보여 주는 문장. 이름은 `<strong>` 으로 감싼다
 * @property confirmLabel 확인 버튼 문구. 동작마다 다르다
 * @property pendingLabel 요청이 도는 동안의 문구. "삭제 중…" 이 모든 동작에 맞지는 않는다
 * @property toFailureMessage 실패를 사용자가 읽을 문장으로 옮긴다. 403 과 그 밖을 가르는 것도 여기다
 */
export function ConfirmActionDialog({
  body,
  confirmLabel,
  cancelLabel,
  onClose,
  onConfirm,
  pendingLabel,
  title,
  toFailureMessage,
}: {
  body: ReactNode
  confirmLabel: string
  cancelLabel: string
  onClose: () => void
  onConfirm: () => Promise<void>
  pendingLabel: string
  title: string
  toFailureMessage: (error: unknown) => string
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()

  async function confirm() {
    setPending(true)
    setFailure(null)

    try {
      await onConfirm()
    } catch (error: unknown) {
      setFailure(toFailureMessage(error))
      setPending(false)
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={title}>
      <p className="dialog-copy">{body}</p>

      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      <div className="dialog-actions">
        <button
          className="button button--secondary"
          disabled={pending}
          onClick={onClose}
          type="button"
        >
          {cancelLabel}
        </button>
        <button
          className="button button--danger"
          disabled={pending}
          onClick={() => void confirm()}
          type="button"
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
