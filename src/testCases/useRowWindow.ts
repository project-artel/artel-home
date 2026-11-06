import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 긴 표에서 보이는 줄과 위아래 여유만 그린다(ARTEL-1211). 케이스 라이브러리는 줄 높이가 모두 같아(한 줄 말줄임)
 * 높이를 재지 않고 한 값으로 계산한다. 그리지 않은 줄 자리는 위아래 빈 줄이 채워 스크롤 길이는 그대로다.
 */

export type RowWindow = { start: number; end: number; padTop: number; padBottom: number }

/**
 * 스크롤 위치에서 그릴 줄 범위. `headerHeight` 는 줄보다 먼저 오는 표 머리 높이다. `end` 는 그리지 않는 첫 줄이다.
 */
export function windowRange({
  scrollTop,
  viewport,
  count,
  rowHeight,
  overscan,
  headerHeight = 0,
}: {
  scrollTop: number
  viewport: number
  count: number
  rowHeight: number
  overscan: number
  headerHeight?: number
}): RowWindow {
  if (count === 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  const top = Math.max(0, scrollTop - headerHeight)
  const first = Math.floor(top / rowHeight)
  const visible = Math.ceil(Math.max(viewport, rowHeight) / rowHeight)
  const start = Math.max(0, first - overscan)
  const end = Math.min(count, first + visible + overscan)
  return { start, end, padTop: start * rowHeight, padBottom: (count - end) * rowHeight }
}

/** 줄 `index` 가 보이게 하려면 옮겨야 할 scrollTop. 이미 보이면 null. */
export function scrollToShow({
  index,
  scrollTop,
  viewport,
  rowHeight,
  headerHeight = 0,
}: {
  index: number
  scrollTop: number
  viewport: number
  rowHeight: number
  headerHeight?: number
}): number | null {
  const rowTop = headerHeight + index * rowHeight
  const rowBottom = rowTop + rowHeight
  // 머리가 위에 붙어 있으면 그 아래부터가 보이는 칸이다.
  if (rowTop < scrollTop + headerHeight) return Math.max(0, rowTop - headerHeight)
  if (rowBottom > scrollTop + viewport) return rowBottom - viewport
  return null
}

/** 보이는 줄 수보다 넉넉히: 빠르게 굴려도 빈칸이 덜 보인다. */
const OVERSCAN = 12

/** 재기 전에 쓰는 줄 · 표 머리 높이(px). 케이스 라이브러리의 실제 값이다. */
const DEFAULT_ROW = 47
const DEFAULT_HEADER = 40

/**
 * `scroller` 는 표를 감싼 스크롤 칸이다. 줄 높이는 그 안의 첫 `tbody tr.tct-row`, 표 머리는 `thead` 에서 잰다.
 */
export function useRowWindow(scroller: HTMLElement | null, count: number) {
  const [view, setView] = useState({ scrollTop: 0, viewport: 800, rowHeight: DEFAULT_ROW, headerHeight: DEFAULT_HEADER })
  const { rowHeight, headerHeight } = view
  // 스크롤 이벤트는 화면 그리기에 맞춰 온다. 키보드로 굴린 직후에는 기다리지 않고 바로 읽도록 남겨 둔다.
  const readRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (scroller === null) return
    const read = () => {
      const row = scroller.querySelector<HTMLElement>('tbody tr.tct-row')?.offsetHeight
      const header = scroller.querySelector<HTMLElement>('thead')?.offsetHeight
      setView((current) => {
        const next = {
          scrollTop: scroller.scrollTop,
          viewport: scroller.clientHeight,
          rowHeight: row !== undefined && row > 0 ? row : current.rowHeight,
          headerHeight: header ?? current.headerHeight,
        }
        return current.scrollTop === next.scrollTop &&
          current.viewport === next.viewport &&
          current.rowHeight === next.rowHeight &&
          current.headerHeight === next.headerHeight
          ? current
          : next
      })
    }
    readRef.current = read
    read()
    scroller.addEventListener('scroll', read, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    observer?.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', read)
      observer?.disconnect()
    }
  }, [scroller])

  const range = windowRange({ scrollTop: view.scrollTop, viewport: view.viewport, count, rowHeight, overscan: OVERSCAN, headerHeight })

  /** 키보드 커서가 그리지 않은 줄로 가면 그 줄이 보이도록 굴린다. */
  const ensureVisible = useCallback(
    (index: number) => {
      if (scroller === null || index < 0 || index >= count) return
      const next = scrollToShow({ index, scrollTop: scroller.scrollTop, viewport: scroller.clientHeight, rowHeight, headerHeight })
      if (next === null) return
      scroller.scrollTo({ top: next })
      readRef.current()
    },
    [scroller, count, rowHeight, headerHeight],
  )

  return { ...range, ensureVisible }
}
