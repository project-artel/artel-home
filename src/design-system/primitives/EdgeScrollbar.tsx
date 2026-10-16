import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** 손이 가까이 오면 굵어지는 거리. 이보다 멀면 얇은 선으로 돌아간다. */
const NEAR_PX = 32
/** 목록이 아주 길어도 잡을 것은 남겨 둔다. */
const MIN_THUMB_PX = 28

/**
 * 막대가 서는 자리와 길이. 세로 막대(`left` · `right`)면 위에서부터의 거리와 높이, 가로 막대
 * (`bottom`)면 왼쪽에서부터의 거리와 너비다 — 축만 다르고 계산은 같다.
 */
type Box = { start: number; length: number; thumbStart: number; thumbLength: number; scrollable: boolean }

const EMPTY: Box = { start: 0, length: 0, thumbStart: 0, thumbLength: 0, scrollable: false }

/**
 * The scroll indicator for a panel that hides its native scrollbar — drawn as a
 * real element so it can animate.
 *
 * The native one cannot: Chrome paints `::-webkit-scrollbar` on its own layer and
 * drops `transition` there, so a 4px bar that thickens as the pointer approaches
 * is not expressible in CSS alone. That thin bar is what we want at rest (three
 * scrollbars on one screen was one too many), and it is also too thin to grab —
 * which is the whole reason this exists.
 *
 * The track is inert (`pointer-events:none` in CSS); only the thumb takes the
 * pointer. A live track would swallow clicks along the panel's edge, and in the
 * scenario rail that edge is part of every row.
 *
 * Place it inside the scroller's positioned parent — `top`/`height` are measured
 * against that parent, not the viewport.
 *
 * `scroller` is the node itself, not a ref, so that the measuring effect re-runs
 * when it appears. The chat's list is not in the DOM until the first message
 * lands; a ref would still read null on mount and nothing would make the effect
 * look again.
 */
export function EdgeScrollbar({
  scroller,
  side,
  label,
}: {
  scroller: HTMLElement | null
  /**
   * Which edge of the panel the bar sits on. The two rails point outward. `bottom` is the
   * horizontal bar for a row that scrolls sideways (QA history's run strip, ARTEL-1100).
   */
  side: 'left' | 'right' | 'bottom'
  label: string
}) {
  const [box, setBox] = useState<Box>(EMPTY)
  const [near, setNear] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Measured straight through, with no `requestAnimationFrame` throttle in the
  // way — a tab that is not in front never runs one. Re-render churn is held down
  // by returning the previous box unchanged when nothing moved, which is the
  // cheaper guard anyway.
  const measure = useCallback(() => {
    const el = scroller
    if (el === null) return
    const horizontal = side === 'bottom'
    const total = horizontal ? el.scrollWidth : el.scrollHeight
    const length = horizontal ? el.clientWidth : el.clientHeight
    const room = total - length
    if (room <= 1) {
      setBox((current) => (current.scrollable ? EMPTY : current))
      return
    }
    const thumbLength = Math.max(MIN_THUMB_PX, Math.round(length * (length / total)))
    const offset = horizontal ? el.scrollLeft : el.scrollTop
    const next: Box = {
      start: horizontal ? el.offsetLeft : el.offsetTop,
      length,
      thumbLength,
      thumbStart: Math.round((offset / room) * (length - thumbLength)),
      scrollable: true,
    }
    setBox((current) =>
      current.scrollable
      && current.start === next.start
      && current.length === next.length
      && current.thumbStart === next.thumbStart
      && current.thumbLength === next.thumbLength
        ? current
        : next,
    )
  }, [scroller, side])

  // Three different things move the thumb, and each needs its own listener.
  // Scrolling fires `scroll`. Resizing the panel fires the ResizeObserver. Content
  // arriving fires NEITHER when the panel's own height is fixed — the chat is
  // exactly that: a flex column whose box never changes while messages pile up
  // inside it, growing only `scrollHeight`, which no observer reports. So the
  // MutationObserver watches the children instead.
  useEffect(() => {
    const el = scroller
    if (el === null) return undefined
    const resize = new ResizeObserver(measure)
    resize.observe(el)
    const mutation = new MutationObserver(measure)
    mutation.observe(el, { childList: true, subtree: true, characterData: true })
    el.addEventListener('scroll', measure, { passive: true })
    // And once now, rather than waiting for the ResizeObserver's first callback:
    // that one is delivered during a frame, and a panel opened in a tab that is
    // not in front would have no bar at all until the tab was looked at.
    const first = setTimeout(measure, 0)
    return () => {
      clearTimeout(first)
      resize.disconnect()
      mutation.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [scroller, measure])

  // Proximity, watched on the PANEL rather than on the scroller. The bar is the
  // scroller's sibling, not its child, so listening on the scroller made reaching
  // the bar flip the state off: the pointer left the scroller, the bar thinned,
  // the pointer was over the scroller again, the bar thickened — a flicker you
  // could not click through. The panel contains both, so crossing onto the bar
  // changes nothing.
  //
  // Distance is measured to the edge, not by hovering a hit area, so nothing sits
  // between the cursor and the rows while the bar is at rest.
  useEffect(() => {
    const el = scroller
    const panel = el?.offsetParent
    if (el === null || !(panel instanceof HTMLElement)) return undefined
    function onMove(event: MouseEvent) {
      const rect = (el as HTMLElement).getBoundingClientRect()
      const distance =
        side === 'left' ? event.clientX - rect.left : side === 'right' ? rect.right - event.clientX : rect.bottom - event.clientY
      setNear(distance <= NEAR_PX)
    }
    const onLeave = () => setNear(false)
    panel.addEventListener('mousemove', onMove)
    panel.addEventListener('mouseleave', onLeave)
    return () => {
      panel.removeEventListener('mousemove', onMove)
      panel.removeEventListener('mouseleave', onLeave)
    }
  }, [scroller, side])

  const onThumbDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const el = scroller
    if (el === null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    const horizontal = side === 'bottom'
    const startPointer = horizontal ? event.clientX : event.clientY
    const startOffset = horizontal ? el.scrollLeft : el.scrollTop
    const travel = box.length - box.thumbLength
    const room = horizontal ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight

    function onMove(moveEvent: PointerEvent) {
      if (travel <= 0) return
      const moved = (((horizontal ? moveEvent.clientX : moveEvent.clientY) - startPointer) / travel) * room
      if (horizontal) (el as HTMLElement).scrollLeft = startOffset + moved
      else (el as HTMLElement).scrollTop = startOffset + moved
    }
    function onUp() {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [scroller, side, box.length, box.thumbLength])

  if (!box.scrollable) return null

  return (
    <div
      aria-hidden="true"
      className={`edgebar edgebar--${side}` + (near || dragging ? ' is-near' : '')}
      style={side === 'bottom' ? { left: box.start, width: box.length } : { top: box.start, height: box.length }}
    >
      {/* 잡는 면적과 그려지는 굵기를 나눈다. 4px 을 정확히 맞춰 누르라는 것은 무리고,
          그렇다고 늘 넓은 면적이 깔려 있으면 행의 왼쪽 끝 클릭을 삼킨다 — 그래서 면적은
          가까이 왔을 때만 살아난다(`pointer-events` 는 CSS 가 `.is-near` 로 켠다). */}
      <div
        className="edgebar-thumb"
        onPointerDown={onThumbDown}
        style={side === 'bottom' ? { left: box.thumbStart, width: box.thumbLength } : { top: box.thumbStart, height: box.thumbLength }}
        title={label}
      >
        <div className="edgebar-fill" />
      </div>
    </div>
  )
}
