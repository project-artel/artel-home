import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type ContextMenuItem = {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/**
 * 우클릭 메뉴(ARTEL-1024). 누른 자리에 뜨고, 바깥을 누르거나 Escape · 스크롤이면 닫힌다.
 *
 * 화면 끝에서 누르면 메뉴가 잘리지 않게 안쪽으로 당긴다. 열리면 첫 항목에 focus 를 주고 ↑↓ 로 움직인다 —
 * 키보드로는 Shift+F10 이나 메뉴 키로 연다(부르는 쪽의 `onContextMenu` 가 그 키도 받는다).
 * 부모의 `overflow` · `z-index` 에 갇히지 않게 body 로 띄운다.
 */
export function ContextMenu({
  items,
  label,
  onClose,
  x,
  y,
}: {
  items: readonly ContextMenuItem[]
  label: string
  onClose: () => void
  x: number
  y: number
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (menu === null) return
    const rect = menu.getBoundingClientRect()
    const margin = 8
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    })
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [x, y])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  function moveFocus(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    if (buttons.length === 0) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    buttons[(index + step + buttons.length) % buttons.length].focus()
  }

  return createPortal(
    <div
      aria-label={label}
      className="ctx-menu"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveFocus}
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item) => (
        <button
          className={'ctx-menu-item' + (item.danger === true ? ' ctx-menu-item--danger' : '')}
          disabled={item.disabled}
          key={item.label}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
