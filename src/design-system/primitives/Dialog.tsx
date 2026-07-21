import { useEffect, useRef, type ReactNode } from 'react'

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

  return (
    <div className="dialog-scrim" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
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
    </div>
  )
}
