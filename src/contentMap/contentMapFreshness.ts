import type { ContentMapView } from './contentMapTypes'

/**
 * A signed capture URL whose lifetime the server does not state is assumed dead
 * after this long, so a view that never changes still gets its URLs renewed.
 */
export const UNSTATED_URL_LIFETIME_MS = 4 * 60_000

/** A signed URL that expires within this window counts as already due. */
export const EXPIRY_MARGIN_MS = 60_000

/** Copies of the view with every signed-URL field blanked, for comparing what the signing does not touch. */
function withoutSignedUrls(view: ContentMapView): string {
  return JSON.stringify(view, (key, value: unknown) =>
    key === 'url' || key === 'expiresAt' ? undefined : value,
  )
}

/** The earliest `expiresAt` anywhere in the view, or null when none states one. */
function earliestExpiry(view: ContentMapView): number | null {
  let earliest: number | null = null
  JSON.stringify(view, (key, value: unknown) => {
    if (key === 'expiresAt' && typeof value === 'string') {
      const at = Date.parse(value)
      if (!Number.isNaN(at) && (earliest === null || at < earliest)) earliest = at
    }
    return value
  })
  return earliest
}

/**
 * Whether a re-read should replace the view already on screen.
 *
 * Every read signs capture URLs afresh, so two reads of an unchanged build never
 * compare equal. Replacing the view each time would hand the canvas new arrays
 * and make every image reload. The held view is kept while the rest of the
 * content is identical and its URLs are still good, and replaced once either
 * changes or the URLs are about to expire.
 */
export function shouldAdoptView(
  held: ContentMapView | null,
  next: ContentMapView,
  heldSince: number,
  now: number,
): boolean {
  if (held === null) return true
  if (withoutSignedUrls(held) !== withoutSignedUrls(next)) return true
  const expiry = earliestExpiry(held)
  if (expiry !== null) return expiry - now < EXPIRY_MARGIN_MS
  return now - heldSince >= UNSTATED_URL_LIFETIME_MS
}
