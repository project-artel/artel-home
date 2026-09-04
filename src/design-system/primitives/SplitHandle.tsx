import { useCallback, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

/** 화살표 한 번의 폭. 끌기와 달리 키보드는 눈금이 있어야 쓸 만하다. */
const STEP_PX = 16
/** Shift 를 누르면 성큼. 300px 을 16px 씩 옮기는 것은 스무 번이다. */
const COARSE_STEP_PX = 64

/**
 * The draggable boundary between two columns.
 *
 * It owns no width. The caller does — this reports where the pointer went and
 * lets the page decide what that means for its grid, because the same handle
 * sits to the LEFT of the column it sizes: dragging left makes the chat wider,
 * not narrower, and only the page knows that.
 *
 * Keyboard is not an afterthought here. A pointer-only splitter fails
 * `DESIGN.md`'s "make every feature keyboard accessible", and a `separator` with
 * arrow keys is what a screen reader already knows how to drive.
 */
export function SplitHandle({
  label,
  value,
  min,
  max,
  onChange,
  onDragState,
  /** `-1` when dragging right must SHRINK the value — the handle left of the column it sizes. */
  sign = 1,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (next: number) => void
  onDragState?: (dragging: boolean) => void
  sign?: 1 | -1
}) {
  const [dragging, setDragging] = useState(false)

  const clamp = useCallback((next: number) => Math.min(max, Math.max(min, Math.round(next))), [min, max])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // `preventDefault` 는 끄는 동안 글자가 잡히는 것을 막지만 기본 포커스까지 막는다.
    // 그러면 손으로 잡았던 경계를 이어서 화살표로 옮길 수가 없다 — 직접 준다.
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    onDragState?.(true)
    const startX = event.clientX
    const startValue = value

    function onMove(moveEvent: PointerEvent) {
      onChange(clamp(startValue + sign * (moveEvent.clientX - startX)))
    }
    function onUp() {
      setDragging(false)
      onDragState?.(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [value, sign, clamp, onChange, onDragState])

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? COARSE_STEP_PX : STEP_PX
    if (event.key === 'ArrowLeft') { event.preventDefault(); onChange(clamp(value - sign * step)); return }
    if (event.key === 'ArrowRight') { event.preventDefault(); onChange(clamp(value + sign * step)); return }
    // Home/End 는 축이 아니라 칸 크기다 — WAI-ARIA 의 window splitter 가 그렇게 정한다.
    // 경계가 어느 쪽에 붙어 있든 Home 은 가장 좁게, End 는 가장 넓게다.
    if (event.key === 'Home') { event.preventDefault(); onChange(min); return }
    if (event.key === 'End') { event.preventDefault(); onChange(max) }
  }, [value, sign, min, max, clamp, onChange])

  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={'st-split' + (dragging ? ' is-dragging' : '')}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
    />
  )
}
