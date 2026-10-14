/**
 * How many items fall under each key, for the legend's counts.
 *
 * Keys absent from `items` are absent from the map; a caller that draws a row
 * for one reads it as zero.
 */
export function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const value = key(item)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}
