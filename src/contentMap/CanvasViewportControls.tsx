import { useI18n } from '../i18n/useI18n'
import type { CanvasViewport } from './useCanvasViewport'

/**
 * Zoom and reset controls for a canvas.
 *
 * These live outside the drawing because the canvases in this directory are
 * `aria-hidden` and pointer-only. A button placed inside one would be reachable
 * by a pointer and by nothing else, and the wheel and drag gestures it
 * duplicates are already pointer-only — so this row is the sole path for a
 * reader who is not using one.
 *
 * There is no "pan" control. A direction pad would need four buttons to say
 * what dragging says with one gesture, and the zoom buttons plus reset already
 * cover the case that matters without a pointer: getting close enough to read a
 * crowded container, and getting back out.
 */
export function CanvasViewportControls({ viewport }: { viewport: CanvasViewport }) {
  const { t } = useI18n()
  const copy = t.contentMap.viewport

  return (
    <div className="cm-viewport-controls">
      {/*
        The readout is polite rather than assertive: it changes on every wheel
        notch, and an assertive region would interrupt a screen reader
        continuously while someone zooms.
      */}
      <span aria-live="polite" className="cm-viewport-scale">
        {copy.scale(viewport.scale)}
      </span>
      <button
        aria-label={copy.zoomOut}
        className="button-ghost cm-viewport-button"
        onClick={viewport.zoomOut}
        type="button"
      >
        −
      </button>
      <button
        aria-label={copy.zoomIn}
        className="button-ghost cm-viewport-button"
        onClick={viewport.zoomIn}
        type="button"
      >
        +
      </button>
      <button
        className="button-ghost cm-viewport-button cm-viewport-button--reset"
        disabled={!viewport.moved}
        onClick={viewport.reset}
        type="button"
      >
        {copy.reset}
      </button>
    </div>
  )
}
