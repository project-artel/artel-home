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

/**
 * Where a knowledge item holds, when it does not hold everywhere.
 *
 * 화면 지도는 orchestration server 의 `content_map` 으로 옮겼다. 지식창고에 남는 것 중
 * 한 화면에서만 참인 사실이 이 앵커를 단다.
 */
export type KnowledgeAnchor = {
  /** The scene the item is tied to. An anchor always names one. */
  sceneName: string
  /**
   * Null whenever the anchor stops at the scene.
   *
   * 화면은 관측으로 정해지고 대개 정해지지 않는다. 그래서 `null` 은 결손이 아니라 보통이며,
   * 서버가 문자열로 보내는 id 다 — 숫자로 다루면 앞의 0 이 잘린다.
   */
  screenId: string | null
}

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
  /**
   * Scenes and screens this item is tied to. Empty is the ordinary case and
   * means the fact holds across the whole game — not that the field is missing.
   */
  anchors: KnowledgeAnchor[]
}

/**
 * One item's body, from the single-item endpoint the graph list deliberately
 * does not carry (ARTEL-752/753/754). Only the three fields the contract
 * guarantees — this build has no use for anything beyond them yet.
 */
export type KnowledgeItemDetail = {
  id: string
  summary: string
  /**
   * May hold several `key: value` lines joined by newlines for an item
   * extracted from a document. The newlines are meaningful and must render as
   * line breaks, not be collapsed.
   */
  description: string
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
 * Relations this build knows how to draw. Order is the legend order: the five
 * ordinary relations first, then the one that disagrees.
 *
 * `PART_OF` is not one a QA agent can assert — the ingest pipeline is the only
 * writer, and it always points from an extracted item to the document node it
 * came from (ARTEL-747/748). It sits with the ordinary relations rather than
 * with `CONTRADICTS` because, unlike a contradiction, it has a direction.
 */
export const KNOWN_RELATIONS = [
  'LEADS_TO',
  'REFINES',
  'DEPENDS_ON',
  'REPLACES',
  'PART_OF',
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

/**
 * The document node ids in this graph, picked out by structure rather than by
 * field.
 *
 * ARTEL-748's contract says a document node's `source` is `DOCS` — but every
 * item extracted from that document also carries `source: 'DOCS'` (see the
 * comment on `KnowledgeNode.source` above), so testing `source` alone would
 * flag the whole document, not just the one node that represents it. What
 * actually sets the document node apart is that a `PART_OF` edge always points
 * *at* it: the direction is item → document (ARTEL-747/748), never the other
 * way. So a node is the document node for a `PART_OF` group exactly when it is
 * some edge's `to`.
 *
 * This does not depend on any field ARTEL-748 has not committed to yet — a
 * document node still needs its own `tag`, and this build does not know what
 * value that will carry. Once the server ships a discriminator built for this
 * purpose, prefer it over this structural read.
 */
export function documentNodeIds(edges: readonly KnowledgeEdge[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.relation === 'PART_OF') ids.add(edge.to)
  }
  return ids
}
