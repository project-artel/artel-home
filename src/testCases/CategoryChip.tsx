import type { CSSProperties } from 'react'

/**
 * A deterministic hue per category string, so the same category always reads as
 * the same colour across the library and the flow — the eye can group cases by
 * area at a glance instead of reading every label.
 */
function categoryHue(category: string): number {
  let hash = 0
  for (let index = 0; index < category.length; index += 1) {
    hash = (hash * 31 + category.charCodeAt(index)) % 360
  }
  return hash
}

/** A small colour-coded tag for a case's category. Renders nothing when blank. */
export function CategoryChip({ category, className = 'cat-chip' }: { category: string; className?: string }) {
  if (category.trim().length === 0) return null
  const hue = categoryHue(category)
  const style: CSSProperties = {
    background: `hsl(${hue} 45% 16%)`,
    color: `hsl(${hue} 70% 72%)`,
    borderColor: `hsl(${hue} 40% 32%)`,
  }
  return <span className={className} style={style}>{category}</span>
}
