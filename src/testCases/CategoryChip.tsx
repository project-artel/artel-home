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

/**
 * A small colour-coded tag for a case's category. Renders nothing when blank.
 *
 * Only the hue is set inline (`--cat-hue`); the lightness/saturation live in CSS so
 * the chip can read correctly in both themes — a dark tint reversed for light mode
 * rather than the same dark swatch on paper.
 */
export function CategoryChip({ category, className = 'cat-chip' }: { category: string; className?: string }) {
  if (category.trim().length === 0) return null
  const style = { '--cat-hue': String(categoryHue(category)) } as CSSProperties
  return <span className={className} style={style}>{category}</span>
}
