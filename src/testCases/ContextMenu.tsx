import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type ContextMenuItem = {
  label: string
  /** 하위 메뉴가 있는 항목([children])은 고를 것이 없어 비워 둔다. */
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
  /** 하위 메뉴(ARTEL-1328). 있으면 이름 끝에 ▶ 가 붙고, 마우스를 올리거나 → 로 연다. ← 로 닫는다. */
  children?: readonly ContextMenuItem[]
  /** 이 항목 위에 구분선을 긋는다. */
  separatorBefore?: boolean
}

/**
 * 우클릭 메뉴(ARTEL-1024). 누른 자리에 뜨고, 바깥을 누르거나 Escape · 스크롤이면 닫힌다.
 *
 * 화면 끝에서 누르면 메뉴가 잘리지 않게 안쪽으로 당긴다. 열리면 첫 항목에 focus 를 주고 ↑↓ 로 움직인다 —
 * 키보드로는 Shift+F10 이나 메뉴 키로 연다(부르는 쪽의 `onContextMenu` 가 그 키도 받는다).
 * 부모의 `overflow` · `z-index` 에 갇히지 않게 body 로 띄운다.
 *
 * 하위 메뉴는 그 항목 오른쪽에 붙는다(오른쪽이 모자라면 왼쪽). 같은 메뉴 안에 그리므로 바깥 클릭 · Escape 로 함께 닫힌다.
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
  // 열린 하위 메뉴: 어느 항목의 것인지와 그 항목의 화면 위치.
  const [open, setOpen] = useState<{ index: number; anchor: DOMRect; focus: boolean } | null>(null)

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

  /** ↑↓ 는 지금 focus 가 있는 층(메뉴 · 하위 메뉴) 안에서만 움직인다. */
  function moveFocus(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const level = (document.activeElement as HTMLElement | null)?.closest('[role="menu"]') ?? menuRef.current
    const buttons = [...(level?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') ?? [])]
    if (buttons.length === 0) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    buttons[(index + step + buttons.length) % buttons.length].focus()
  }

  function openChildren(index: number, button: HTMLButtonElement, focus: boolean) {
    setOpen({ index, anchor: button.getBoundingClientRect(), focus })
  }

  function renderItem(item: ContextMenuItem, index: number, level: 'top' | 'sub') {
    const hasChildren = item.children !== undefined && item.children.length > 0
    return [
      item.separatorBefore === true ? <hr className="ctx-menu-separator" key={`sep:${item.label}`} /> : null,
      <button
        aria-expanded={hasChildren ? open?.index === index : undefined}
        aria-haspopup={hasChildren ? 'menu' : undefined}
        className={
          'ctx-menu-item' +
          (item.danger === true ? ' ctx-menu-item--danger' : '') +
          (hasChildren ? ' ctx-menu-item--parent' : '') +
          (hasChildren && open?.index === index ? ' is-open' : '')
        }
        disabled={item.disabled}
        key={item.label}
        onClick={(event) => {
          if (hasChildren) {
            openChildren(index, event.currentTarget, true)
            return
          }
          onClose()
          item.onSelect?.()
        }}
        onKeyDown={(event) => {
          if (level === 'top' && hasChildren && event.key === 'ArrowRight') {
            event.preventDefault()
            openChildren(index, event.currentTarget, true)
          }
        }}
        onMouseEnter={(event) => {
          if (level !== 'top') return
          if (hasChildren) openChildren(index, event.currentTarget, false)
          else if (open !== null) setOpen(null)
        }}
        role="menuitem"
        type="button"
      >
        <span>{item.label}</span>
        {hasChildren && <span aria-hidden="true" className="ctx-menu-caret">▶</span>}
      </button>,
    ]
  }

  const children = open === null ? undefined : items[open.index]?.children

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
      {items.flatMap((item, index) => renderItem(item, index, 'top'))}
      {open !== null && children !== undefined && (
        <SubMenu
          anchor={open.anchor}
          focusFirst={open.focus}
          label={items[open.index].label}
          onBack={() => {
            const parent = menuRef.current?.querySelectorAll<HTMLButtonElement>(':scope > button')[open.index]
            setOpen(null)
            parent?.focus()
          }}
        >
          {children.flatMap((item, index) => renderItem(item, index, 'sub'))}
        </SubMenu>
      )}
    </div>,
    document.body,
  )
}

/** 하위 메뉴 판. 부모 항목 오른쪽에 붙고, 오른쪽이 모자라면 왼쪽에 붙는다. ← 는 부모로 돌아간다. */
function SubMenu({
  anchor,
  children,
  focusFirst,
  label,
  onBack,
}: {
  anchor: DOMRect
  children: React.ReactNode
  focusFirst: boolean
  label: string
  onBack: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: anchor.right - 4, top: anchor.top - 4 })
  useLayoutEffect(() => {
    const menu = ref.current
    if (menu === null) return
    const rect = menu.getBoundingClientRect()
    const margin = 8
    const right = anchor.right - 4
    const left = right + rect.width > window.innerWidth - margin ? Math.max(margin, anchor.left - rect.width + 4) : right
    setPosition({ left, top: Math.max(margin, Math.min(anchor.top - 4, window.innerHeight - rect.height - margin)) })
    if (focusFirst) menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [anchor, focusFirst])
  return (
    <div
      aria-label={label}
      className="ctx-menu ctx-menu--sub"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          event.stopPropagation()
          onBack()
        }
      }}
      ref={ref}
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      {children}
    </div>
  )
}
