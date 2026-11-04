import { useCallback, useState } from 'react'

/**
 * 그래프를 놓은 칸의 폭(px). viewBox 를 이 폭으로 잡아 높이와 글씨는 고정하고 가로만 늘린다 — 고정 viewBox 를
 * `width: 100%` 로 늘리면 넓은 모니터에서 축 글씨까지 같은 비율로 커졌다. 재기 전에는 [fallback] 으로 그린다.
 */
export function useWidth(fallback: number): [number, (node: SVGSVGElement | null) => void] {
  const [width, setWidth] = useState(fallback)
  const ref = useCallback((node: SVGSVGElement | null) => {
    if (node === null) return
    const parent = node.parentElement
    if (parent === null) return
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      if (next > 0) setWidth((current) => (current === next ? current : next))
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  return [width, ref]
}
