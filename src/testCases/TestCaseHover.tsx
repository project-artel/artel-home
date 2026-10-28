import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { TestCasePreview } from './TestCasePreview'

/** 기존 요소의 레이아웃과 클릭을 보존하고 상세 조회는 열릴 때만 수행한다. */
export function TestCaseHover({ children, projectId, caseId, gameBuildId = null }: {
  children: ReactElement<HTMLAttributes<HTMLElement>>
  projectId: string
  caseId: string | number | null | undefined
  gameBuildId?: string | null
}) {
  const id = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hovering = useRef(false)
  const enabled = Boolean(projectId) && caseId !== null && caseId !== undefined

  function cancelTimer() { clearTimeout(timer.current) }
  function close() { cancelTimer(); setAnchor(null) }
  function open(element: HTMLElement, delay = 300) {
    if (!enabled) return
    cancelTimer()
    trigger.current = element
    timer.current = setTimeout(() => setAnchor(element), delay)
  }
  function scheduleClose() {
    cancelTimer()
    timer.current = setTimeout(() => {
      const focused = document.activeElement
      if (!hovering.current && !panel.current?.contains(focused) && !trigger.current?.contains(focused)) setAnchor(null)
    }, 200)
  }

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (anchor === null) return
    function dismiss(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (panel.current?.contains(document.activeElement)) anchor?.focus()
      clearTimeout(timer.current)
      setAnchor(null)
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor?.contains(event.target)) setAnchor(null)
    }
    document.addEventListener('keydown', dismiss, true)
    document.addEventListener('pointerdown', outside, true)
    return () => {
      document.removeEventListener('keydown', dismiss, true)
      document.removeEventListener('pointerdown', outside, true)
    }
  }, [anchor])

  useLayoutEffect(() => {
    const element = panel.current
    if (anchor === null || element === null) return
    function position() {
      if (!anchor?.isConnected || element === null) { setAnchor(null); return }
      const bounds = anchor.getBoundingClientRect()
      const width = element.offsetWidth
      const height = element.offsetHeight
      const below = window.innerHeight - bounds.bottom - 8
      const top = below >= height ? bounds.bottom + 8 : bounds.top - height - 8
      element.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8))}px`
      element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [anchor])

  if (!enabled) return children
  const props = children.props
  return <>
    {/* cloneElement는 이벤트 함수를 실행하지 않는다. ref는 아래 이벤트에서만 읽는다. */}
    {/* eslint-disable-next-line react-hooks/refs */}
    {cloneElement(children, {
      tabIndex: props.tabIndex ?? 0,
      'aria-haspopup': 'dialog',
      'aria-expanded': anchor !== null,
      'aria-controls': anchor !== null ? id : undefined,
      onMouseEnter: (event) => { props.onMouseEnter?.(event); hovering.current = true; open(event.currentTarget) },
      onMouseLeave: (event) => { props.onMouseLeave?.(event); hovering.current = false; scheduleClose() },
      onFocus: (event) => { props.onFocus?.(event); open(event.currentTarget, 0) },
      onBlur: (event) => { props.onBlur?.(event); scheduleClose() },
      onClick: (event) => { close(); props.onClick?.(event) },
      onKeyDown: (event) => {
        if (event.key === 'ArrowDown' && event.altKey && anchor !== null) {
          event.preventDefault()
          event.stopPropagation()
          panel.current?.focus()
        } else props.onKeyDown?.(event)
      },
    })}
    {anchor !== null && createPortal(
      <div className="tc-hover" id={id} role="dialog" aria-label="TC" tabIndex={-1} ref={panel}
        onMouseEnter={() => { hovering.current = true; cancelTimer() }}
        onMouseLeave={() => { hovering.current = false; scheduleClose() }}
        onFocus={cancelTimer} onBlur={scheduleClose}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onDragStart={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}>
        <TestCasePreview key={`${projectId}:${caseId}:${gameBuildId}`} projectId={projectId} caseId={String(caseId)} gameBuildId={gameBuildId} />
      </div>, document.body,
    )}
  </>
}
