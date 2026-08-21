import type { CSSProperties } from 'react'
import { sceneHue } from './sceneHue'

/**
 * A small colour-coded tag for the screen a case verifies. Renders nothing when blank.
 *
 * Only the hue is set inline (`--cat-hue`); the lightness/saturation live in CSS so
 * the chip can read correctly in both themes — a dark tint reversed for light mode
 * rather than the same dark swatch on paper.
 *
 * The CSS custom property and class keep their `cat-` names: they are style hooks,
 * not domain vocabulary, and renaming them would touch every rule that positions a
 * chip without changing what anyone sees.
 */
export function SceneChip({ scene, className = 'cat-chip' }: { scene: string; className?: string }) {
  if (scene.trim().length === 0) return null
  const style = { '--cat-hue': String(sceneHue(scene)) } as CSSProperties
  return <span className={className} style={style}>{scene}</span>
}
