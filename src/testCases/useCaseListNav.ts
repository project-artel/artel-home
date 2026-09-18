import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keyboard travel and edge marks for a list of cases.
 *
 * Pulled out of the ⌘K palette so the dashboard library can travel the same way. The
 * two screens differ in what a row *does* — the palette only reads, the dashboard opens
 * an editor — but moving through the list is the same act in both, and a person who
 * learned `↑↓` in one should not find it dead in the other.
 *
 * `edge` says whether the list is scrolled to its top or bottom. The fade arrows read
 * it: without them a list that continues below the fold looks like a list that ended.
 */

export type ListEdge = { top: boolean; bottom: boolean }

export type CaseListNav = {
  active: number
  setActive: (index: number) => void
  listRef: React.RefObject<HTMLDivElement | null>
  edge: ListEdge
  /** Pass to the scrolling element's `onScroll`. */
  onScroll: (event: React.UIEvent<HTMLElement>) => void
  /** Pass to whatever owns focus. Returns true when it handled the key. */
  onKeyDown: (event: React.KeyboardEvent) => boolean
}

export function useCaseListNav(count: number): CaseListNav {
  const [active, setActive] = useState(0)
  const [edge, setEdge] = useState<ListEdge>({ top: true, bottom: false })
  const listRef = useRef<HTMLDivElement | null>(null)

  // Filtering can drop the list under the cursor. Pull it back rather than leaving the
  // detail pane pointed at a row that is no longer shown.
  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, count - 1)))
  }, [count])

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const measure = useCallback((element: HTMLElement) => {
    setEdge({
      top: element.scrollTop <= 2,
      bottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
    })
  }, [])

  // A filter that shortens the list can leave "there is more below" showing over nothing.
  useEffect(() => {
    if (listRef.current !== null) measure(listRef.current)
  }, [count, measure])

  const onScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => measure(event.currentTarget),
    [measure],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((index) => Math.min(index + 1, count - 1))
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((index) => Math.max(index - 1, 0))
        return true
      }
      return false
    },
    [count],
  )

  return { active, setActive, listRef, edge, onScroll, onKeyDown }
}
