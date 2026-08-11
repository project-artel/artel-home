/**
 * The project knowledge base as the graph endpoint describes it.
 *
 * `tag`, `source` and `relation` are kept as plain strings on purpose. The server
 * owns those vocabularies and both of them are expected to grow, so a build that
 * narrowed them to a union would start dropping — or worse, mislabelling — items
 * the day a new value ships. The `KNOWN_*` lists below exist only so the drawing
 * can pick a line pattern and a shape; anything outside them renders through the
 * explicit "unknown" branch and still says what the server said.
 */

export type KnowledgeNode = {
  id: string
  /** e.g. `CONTROL`, `INFO`, `MISC`, `RULE`, `OBJECTIVE`, `UI` — open vocabulary. */
  tag: string
  /** `DOCS` (extracted from an uploaded document) or `QA` (observed during a run). */
  source: string
  summary: string
  /** Null when the server did not send a usable number. */
  version: number | null
  /** Only QA-authored items carry a run; a document-derived item has none. */
  createdByQaTryId: string | null
  createdAt: string
}

export type KnowledgeEdge = {
  from: string
  to: string
  /** e.g. `LEADS_TO`, `REFINES`, `CONTRADICTS`, `DEPENDS_ON`, `REPLACES` — open. */
  relation: string
  /** Why the relation was asserted. The only evidence this edge exists for a reason. */
  note: string | null
}

export type KnowledgeGraph = {
  projectId: string
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  /**
   * True when the node budget cut the result. Edges touching a cut node are gone
   * too, so a truncated graph is not a smaller drawing of the same shape — it is
   * a different shape, and the screen has to say so.
   */
  truncated: boolean
  nodeLimit: number
}

/** How many nodes to ask for. Also the value the screen quotes when truncated. */
export const KNOWLEDGE_NODE_LIMIT = 200

/**
 * Relations this build knows how to draw. Order is the legend order: the four
 * ordinary relations first, then the one that disagrees.
 */
export const KNOWN_RELATIONS = [
  'LEADS_TO',
  'REFINES',
  'DEPENDS_ON',
  'REPLACES',
  'CONTRADICTS',
] as const

export type KnownRelation = (typeof KNOWN_RELATIONS)[number]

export function isKnownRelation(relation: string): relation is KnownRelation {
  return (KNOWN_RELATIONS as readonly string[]).includes(relation)
}

/** Tags with a colour of their own. Everything else falls back to the neutral one. */
export const KNOWN_TAGS = ['CONTROL', 'INFO', 'MISC', 'RULE', 'OBJECTIVE', 'UI'] as const

export type KnownTag = (typeof KNOWN_TAGS)[number]

export function isKnownTag(tag: string): tag is KnownTag {
  return (KNOWN_TAGS as readonly string[]).includes(tag)
}

export const KNOWN_SOURCES = ['DOCS', 'QA'] as const

export type KnownSource = (typeof KNOWN_SOURCES)[number]

export function isKnownSource(source: string): source is KnownSource {
  return (KNOWN_SOURCES as readonly string[]).includes(source)
}

/**
 * The relation a piece of UI should style an edge as, collapsing everything the
 * server invented after this build into one honest bucket. The raw string is
 * still shown to the user; only the ink is generalised.
 */
export type RelationStyle = KnownRelation | 'UNKNOWN'

export function relationStyle(relation: string): RelationStyle {
  return isKnownRelation(relation) ? relation : 'UNKNOWN'
}
