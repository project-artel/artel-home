import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PickerOption = { value: string; label: string }

/**
 * 라이브러리의 고르기 상자(ARTEL-1022). 브라우저 기본 `<select>` 대신 쓴다 — 열린 목록이 운영체제 모양이라
 * 화면의 칩 · 메뉴와 따로 놀았다.
 *
 * 누르면 바로 아래에 목록이 뜬다. ↑↓ 로 움직이고 Enter 로 고르며 Escape · 바깥 누르기로 닫는다. 닫히면 focus 는
 * 단추로 돌아온다. 목록은 body 로 띄워 표의 `overflow` 에 잘리지 않는다.
 */
export function Picker({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: readonly PickerOption[]
  value: string
}) {
  const labelId = useId()
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const current = options.find((option) => option.value === value) ?? options[0]

  const openList = () => {
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    setOpen(true)
  }
  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])
  const choose = (index: number) => {
    const option = options[index]
    if (option !== undefined && option.value !== value) onChange(option.value)
    close(true)
  }

  return (
    <div className="pick-field">
      <span className="field-label" id={labelId}>{label}</span>
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${listId}-value`}
        className={'pick' + (open ? ' is-open' : '')}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            openList()
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="pick-value" id={`${listId}-value`}>{current?.label ?? ''}</span>
        <svg aria-hidden="true" className="pick-chevron" viewBox="0 0 16 16">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <PickerList
          active={active}
          anchorRef={triggerRef}
          id={listId}
          labelledBy={labelId}
          onActive={setActive}
          onChoose={choose}
          onClose={close}
          options={options}
          value={value}
        />
      )}
    </div>
  )
}

function PickerList({
  active,
  anchorRef,
  id,
  labelledBy,
  onActive,
  onChoose,
  onClose,
  options,
  value,
}: {
  active: number
  anchorRef: React.RefObject<HTMLButtonElement | null>
  id: string
  labelledBy: string
  onActive: (index: number) => void
  onChoose: (index: number) => void
  onClose: (refocus: boolean) => void
  options: readonly PickerOption[]
  value: string
}) {
  const listRef = useRef<HTMLUListElement | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0 })

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (anchor === null) return
    const rect = anchor.getBoundingClientRect()
    const height = listRef.current?.offsetHeight ?? 0
    // 아래가 모자라면 위로 연다.
    const below = rect.bottom + 4
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - 4 - height) : below
    setPosition({ left: rect.left, top, width: rect.width })
    listRef.current?.focus()
  }, [anchorRef])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (listRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose(false)
    }
    const onScroll = (event: Event) => {
      if (listRef.current?.contains(event.target as Node)) return
      onClose(false)
    }
    const onResize = () => onClose(false)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [anchorRef, onClose])

  return createPortal(
    <ul
      aria-activedescendant={`${id}-${active}`}
      aria-labelledby={labelledBy}
      className="pick-menu"
      id={id}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          onActive(Math.min(options.length - 1, active + 1))
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          onActive(Math.max(0, active - 1))
        } else if (event.key === 'Home') {
          event.preventDefault()
          onActive(0)
        } else if (event.key === 'End') {
          event.preventDefault()
          onActive(options.length - 1)
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onChoose(active)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onClose(true)
        } else if (event.key === 'Tab') {
          onClose(false)
        }
      }}
      ref={listRef}
      role="listbox"
      style={{ left: position.left, top: position.top, minWidth: position.width }}
      tabIndex={-1}
    >
      {options.map((option, index) => (
        <li
          aria-selected={option.value === value}
          className={'pick-option' + (index === active ? ' is-active' : '')}
          data-index={index}
          id={`${id}-${index}`}
          key={option.value}
          onClick={() => onChoose(index)}
          onMouseMove={() => {
            if (index !== active) onActive(index)
          }}
          role="option"
        >
          <span className="pick-option-label">{option.label}</span>
          {option.value === value && (
            <svg aria-hidden="true" className="pick-check" viewBox="0 0 16 16">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          )}
        </li>
      ))}
    </ul>,
    document.body,
  )
}
