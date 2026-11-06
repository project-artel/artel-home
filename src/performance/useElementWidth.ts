import { useEffect, useState } from 'react'

/**
 * 요소의 실제 폭(px). 차트 viewBox 폭을 이 값으로 잡으면 넓은 창에서 글자가 함께 커지지 않는다(ARTEL-1207).
 * 아직 재지 못했으면 `fallback` 이다.
 */
export function useElementWidth(node: Element | null, fallback: number): number {
  return useElementSize(node, { width: fallback, height: 0 }).width
}

type Size = { width: number; height: number }

/** 요소의 실제 폭 · 높이(px, 안쪽 여백 제외). 남은 높이를 채우는 차트가 쓴다. */
export function useElementSize(node: Element | null, fallback: Size): Size {
  const [size, setSize] = useState<Size | null>(null)

  useEffect(() => {
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width)
      const height = Math.round(entries[0].contentRect.height)
      if (width <= 0) return
      setSize((current) => (current?.width === width && current.height === height ? current : { width, height }))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return size ?? fallback
}
