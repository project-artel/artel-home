/**
 * Reasoning efforts from weakest to strongest, which is the order a slider runs in.
 *
 * The catalog sends them strongest first — `ReasoningEffort` is declared
 * `max, xhigh, high, medium, low` on the agent side — so feeding that array straight
 * to a range input put `max` at the left end and `low` at the right, and dragging
 * right asked the model to think less (ARTEL-822).
 *
 * Sorting against this list rather than reversing what arrived keeps the slider
 * correct whichever order the catalog sends, and a model that advertises a subset
 * still comes out in the right order: Grok has no `max`, Kimi has no `xhigh` or
 * `medium`.
 */
export const EFFORT_STRENGTH = ['low', 'medium', 'high', 'xhigh', 'max']

function rank(effort: string): number {
  const index = EFFORT_STRENGTH.indexOf(effort)
  // An effort this list has never heard of sorts to the strong end rather than
  // vanishing: the catalog is the authority on what a model accepts, and dropping
  // one would quietly take a choice away from the operator.
  return index === -1 ? EFFORT_STRENGTH.length : index
}

/** The given efforts, weakest first. Does not mutate the input. */
export function byAscendingEffort(efforts: readonly string[]): string[] {
  return [...efforts].sort((a, b) => rank(a) - rank(b))
}
