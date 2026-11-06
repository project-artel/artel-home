import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

/** 이만큼 움직여야 끌기로 본다. 그 전에 떼면 누르기(click)다. */
const DRAG_PX = 5
/** 스크롤 칸 위 · 아래 가장자리에서 이만큼 안이면 저절로 넘긴다. */
const EDGE_PX = 48
const SCROLL_STEP = 14
/** 놓은 줄이 제자리로 내려앉는 시간. 끝나면 실제 순서를 바꾼다. */
const SETTLE_MS = 170

type Start = {
  index: number
  pointerY: number
  tops: number[]
  heights: number[]
  stride: number
  active: boolean
  lastClientY: number
}

/** [stride] 는 잡은 줄 한 칸의 높이(줄 사이 틈 포함). 비켜 주는 줄이 이만큼 움직인다. */
export type LiftSortState = { from: number; to: number; dy: number; settling: boolean; stride: number }

/**
 * 세로 목록을 손으로 잡아 순서를 바꾸는 hook. 브라우저 기본 끌기(HTML5 DnD)는 반투명 사진만 따라오고 줄은
 * 그대로라 잡고 있다는 느낌이 없다. 여기서는 잡은 줄이 그림자를 달고 떠올라 포인터를 따라오고, 다른 줄이 들어갈
 * 자리를 비켜 주며 미끄러지고, 놓으면 그 자리로 내려앉은 뒤에 [onMove] 로 실제 순서를 바꾼다.
 *
 * 좌표는 [scroller] 의 내용 기준이라 끄는 동안 저절로 넘겨도 자리가 맞는다.
 */
export function useLiftSort({
  count,
  scroller,
  onMove,
  canDrag,
}: {
  count: number
  scroller: HTMLElement | null
  /** [from] 줄을 [to] 자리로(옮긴 뒤의 index). */
  onMove: (from: number, to: number) => void
  /** 이 줄을 이 자리에서 잡을 수 있나. 단추 · 입력칸을 누른 것은 끌기가 아니다. */
  canDrag?: (index: number, target: HTMLElement) => boolean
}) {
  const rows = useRef(new Map<number, HTMLElement>())
  const start = useRef<Start | null>(null)
  const [state, setState] = useState<LiftSortState | null>(null)
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  })

  const contentY = useCallback((clientY: number) => {
    if (scroller === null) return clientY
    return clientY - scroller.getBoundingClientRect().top + scroller.scrollTop
  }, [scroller])

  const targetOf = useCallback((s: Start, dy: number) => {
    const center = s.tops[s.index] + s.heights[s.index] / 2 + dy
    let to = 0
    for (let i = 0; i < s.tops.length; i += 1) {
      if (i !== s.index && s.tops[i] + s.heights[i] / 2 < center) to += 1
    }
    return to
  }, [])

  const update = useCallback((clientY: number) => {
    const s = start.current
    if (s === null) return
    s.lastClientY = clientY
    const dy = contentY(clientY) - s.pointerY
    if (!s.active) {
      if (Math.abs(dy) < DRAG_PX) return
      s.active = true
      document.body.classList.add('is-lift-sorting')
    }
    setState({ from: s.index, to: targetOf(s, dy), dy, settling: false, stride: s.stride })
  }, [contentY, targetOf])

  // 끄는 동안 가장자리 가까이 있으면 저절로 넘긴다.
  useEffect(() => {
    if (state === null || state.settling || scroller === null) return undefined
    const timer = window.setInterval(() => {
      const s = start.current
      if (s === null || !s.active) return
      const rect = scroller.getBoundingClientRect()
      const delta = s.lastClientY < rect.top + EDGE_PX ? -SCROLL_STEP : s.lastClientY > rect.bottom - EDGE_PX ? SCROLL_STEP : 0
      if (delta === 0) return
      const before = scroller.scrollTop
      scroller.scrollTop += delta
      if (scroller.scrollTop !== before) update(s.lastClientY)
    }, 16)
    return () => window.clearInterval(timer)
  }, [state, scroller, update])

  const finish = useCallback(() => {
    const s = start.current
    start.current = null
    document.body.classList.remove('is-lift-sorting')
    if (s === null || !s.active) {
      setState(null)
      return
    }
    // 뒤따르는 click 은 줄을 고르지 않게 삼킨다.
    const swallow = (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    const dy = contentY(s.lastClientY) - s.pointerY
    const to = targetOf(s, dy)
    const finalTop = to > s.index ? s.tops[to] + s.heights[to] - s.heights[s.index] : s.tops[to]
    setState({ from: s.index, to, dy: finalTop - s.tops[s.index], settling: true, stride: s.stride })
    window.setTimeout(() => {
      if (to !== s.index) onMoveRef.current(s.index, to)
      setState(null)
    }, SETTLE_MS)
  }, [contentY, targetOf])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (start.current === null) return
      if (start.current.active) event.preventDefault()
      update(event.clientY)
    }
    const onPointerUp = () => {
      if (start.current !== null) finish()
    }
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [update, finish])

  const begin = useCallback((event: ReactPointerEvent<HTMLElement>, index: number) => {
    if (event.button !== 0 || state !== null) return
    if (canDrag !== undefined && !canDrag(index, event.target as HTMLElement)) return
    const tops: number[] = []
    const heights: number[] = []
    for (let i = 0; i < count; i += 1) {
      const el = rows.current.get(i)
      const rect = el?.getBoundingClientRect()
      tops.push(rect === undefined ? 0 : contentY(rect.top))
      heights.push(rect?.height ?? 0)
    }
    const next = index + 1 < count ? tops[index + 1] - (tops[index] + heights[index]) : index > 0 ? tops[index] - (tops[index - 1] + heights[index - 1]) : 0
    start.current = { index, pointerY: contentY(event.clientY), tops, heights, stride: heights[index] + Math.max(0, next), active: false, lastClientY: event.clientY }
  }, [state, canDrag, count, contentY])

  /** 줄마다 붙일 것. 잡은 줄은 떠서 따라오고, 그 사이의 줄은 한 칸씩 비켜 준다. */
  const bind = useCallback((index: number) => {
    let style: CSSProperties | undefined
    if (state !== null) {
      const stride = state.stride
      if (index === state.from) {
        style = {
          transform: `translateY(${state.dy}px) scale(${state.settling ? 1 : 1.015})`,
          transition: state.settling ? `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.3,1)` : 'none',
          zIndex: 20,
          position: 'relative',
        }
      } else {
        const shift = state.from < index && index <= state.to ? -stride : state.to <= index && index < state.from ? stride : 0
        style = { transform: shift === 0 ? undefined : `translateY(${shift}px)`, transition: 'transform 180ms cubic-bezier(.2,.8,.3,1)' }
      }
    }
    return {
      ref: (node: HTMLElement | null) => {
        if (node === null) rows.current.delete(index)
        else rows.current.set(index, node)
      },
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => begin(event, index),
      style,
      lifted: state !== null && state.from === index,
      settling: state !== null && state.settling && state.from === index,
    }
  }, [state, begin])

  return { state, bind }
}
