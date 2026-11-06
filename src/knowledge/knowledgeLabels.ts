import type { Messages } from '../i18n/messages'
import {
  isKnownSource,
  isKnownTag,
  relationStyle,
  type KnowledgeNode,
  type RelationStyle,
} from './knowledgeTypes'

/*
 * Turning open server vocabularies into something a person reads.
 *
 * The rule everywhere below: a value this build does not recognise is still
 * shown, verbatim, next to an honest label saying it is unrecognised. Hiding it
 * or renaming it to a known value would make the screen lie about what the
 * server actually stored.
 */

/** The translated relation name, or the raw string when the server invented one. */
export function relationLabel(t: Messages, relation: string): string {
  const style = relationStyle(relation)
  if (style !== 'UNKNOWN') return t.knowledge.relations[style]
  return relation.length > 0 ? relation : t.knowledge.relations.unnamed
}

/**
 * The relation's name as read from one endpoint.
 *
 * Every relation but `PART_OF` reads the same regardless of which end is
 * asking — "Depends on" does not say which of the two nodes is the dependent
 * one, and the inspector's own "to"/"from" wording carries that half of the
 * sentence. `PART_OF` cannot share that shortcut: the edge is structural, not
 * symmetric, so the item end and the document end are answering two different
 * questions ("which document is this part of" versus "what does this document
 * contain"), and one verb cannot honestly answer both. `direction === 'in'`
 * is the document's end of the edge — see `incidentEdges` in
 * `knowledgeLayout.ts`.
 */
export function relationLabelForDirection(
  t: Messages,
  relation: string,
  direction: 'out' | 'in' | 'self',
): string {
  if (direction === 'in' && relationStyle(relation) === 'PART_OF') {
    return t.knowledge.relations.PART_OF_CONTAINS
  }
  return relationLabel(t, relation)
}

/** How that relation is drawn, said in words — the colourless half of the legend. */
export function relationShape(t: Messages, style: RelationStyle): string {
  return t.knowledge.relationShapes[style]
}

export function tagLabel(t: Messages, tag: string): string {
  return isKnownTag(tag) ? t.knowledge.tags[tag] : tag
}

export function sourceLabel(t: Messages, source: string): string {
  return isKnownSource(source) ? t.knowledge.sources[source] : source
}

/** `DOCS` is a square, `QA` a circle, anything else a diamond. */
export type NodeShape = 'square' | 'circle' | 'diamond'

export function nodeShape(source: string): NodeShape {
  if (source === 'DOCS') return 'square'
  if (source === 'QA') return 'circle'
  return 'diamond'
}

/** What names an item in a list or under a node mark. */
export function itemTitle(t: Messages, node: KnowledgeNode): string {
  return node.summary.trim().length > 0 ? node.summary.trim() : t.knowledge.list.untitled
}

/**
 * How wide a string draws, in units of one Latin character.
 *
 * Counting characters is what made the labels overlap: `summary` is a whole
 * sentence in Korean, and a Hangul syllable draws about twice as wide as a
 * Latin letter. Twenty-two characters of Korean is forty-four units — far past
 * the gap the layout leaves between two nodes — so every label ran into its
 * neighbour while the count said they were all the same length.
 *
 * The ranges below are the wide ones: Hangul (syllables and Jamo), CJK
 * ideographs and kana, and the fullwidth forms. Everything else counts as one.
 * This is an approximation of a real text measurement, but it is the difference
 * between "roughly right in both scripts" and "wrong in one of them", and it
 * stays a pure function — no canvas, no DOM, testable.
 */
export function displayWidth(text: string): number {
  let width = 0
  for (const character of text) {
    width += isWide(character) ? 2 : 1
  }
  return width
}

function isWide(character: string): boolean {
  const code = character.codePointAt(0)
  if (code === undefined) return false
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals, Kangxi, punctuation
    (code >= 0x3041 && code <= 0x33ff) || // kana, Hangul compatibility Jamo, CJK compat
    (code >= 0x3400 && code <= 0x4dbf) || // CJK extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK unified ideographs
    (code >= 0xa960 && code <= 0xa97f) || // Hangul Jamo extended-A
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK compatibility forms
    (code >= 0xff00 && code <= 0xff60) || // fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

/**
 * Shortened for a mark on the drawing, where there is no room to wrap.
 *
 * The budget is a **width**, not a character count, for the reason above. SVG
 * has no ellipsis of its own so the cut is made here rather than left to CSS,
 * and the full text stays reachable in the inspector.
 *
 * The ellipsis costs one unit, and a budget too small to hold it plus a single
 * character yields the ellipsis alone — a label that says "there is a name
 * here, go read it" rather than a misleading first letter.
 */
export function truncate(text: string, widthLimit = 22): string {
  const trimmed = text.trim()
  if (displayWidth(trimmed) <= widthLimit) return trimmed

  const budget = widthLimit - 1
  let width = 0
  let cut = ''
  for (const character of trimmed) {
    const next = width + (isWide(character) ? 2 : 1)
    if (next > budget) break
    width = next
    cut += character
  }
  return `${cut}…`
}

/** Tag class suffix for styling. Unknown tags share one neutral bucket. */
export function tagClass(tag: string): string {
  return isKnownTag(tag) ? tag : 'UNKNOWN'
}
