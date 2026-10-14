import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A modal dialog with the keyboard behaviour a modal owes the user: focus moves
 * inside on open, `Escape` closes, `Tab` cycles within, and focus returns to
 * whatever opened it.
 *
 * Deliberately not `<dialog>`: its native backdrop cannot be styled with our
 * scrim token consistently across browsers, and `showModal()` needs an effect
 * to stay in sync with React state anyway.
 *
 * Rendered into `document.body`, not where it is declared. A dialog opened from
 * inside a clipped or animated panel (the case library's side pane has
 * `overflow: hidden` and a fade-in) otherwise stays inside that panel's stacking
 * context — the table beside it painted over the scrim and took the clicks.
 */
export function Dialog({
  title,
  onClose,
  children,
  labelledBy,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  labelledBy: string
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    focusables?.item(0)?.focus()

    return () => previouslyFocused?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const focusables = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!focusables || focusables.length === 0) return

      const first = focusables.item(0)
      const last = focusables.item(focusables.length - 1)

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="dialog-scrim"
      // body 로 떴어도 React 의 키 이벤트는 여는 쪽(예: 편집 시트)까지 올라간다. 시트도 Escape 로 닫히므로, 여기서
      // 닫고 멈추지 않으면 Escape 한 번에 dialog 와 시트가 함께 닫혀 쓰던 내용이 사라졌다.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={panel}
      >
        <h2 className="dialog-title" id={labelledBy}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
