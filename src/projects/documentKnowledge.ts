import { documentNodeIds, isKnownTag, type KnowledgeGraph, type KnowledgeNode } from '../knowledge/knowledgeTypes'
import type { ProjectDocument } from './projectTypes'

/** 카드 순서. 기획서를 읽는 사람이 먼저 찾는 것(규칙 · 조작 · 목표)이 앞에 온다. */
const TAG_ORDER = ['RULE', 'CONTROL', 'OBJECTIVE', 'UI', 'INFO', 'MISC']

/**
 * 서버 시계와 업로드 시각이 어긋나도 방금 그 버전의 문서 node 를 놓치지 않을 만큼의 여유.
 * 이전 버전의 node 는 그 버전이 올라간 뒤 곧 만들어졌으니, 이 정도로는 넘어오지 않는다.
 */
const CLOCK_SKEW_MS = 60_000

/**
 * 이 문서 버전에서 추출된 knowledge 항목(ARTEL-1098).
 *
 * 공개 API 에는 "문서 id 로 knowledge 를 거르는" 경로가 없다. 대신 지식 그래프가 쓰는 구조가 있다
 * — 문서에서 뽑힌 항목은 모두 그 문서의 node 로 `PART_OF` edge 를 건다(ARTEL-747/748). 그래서
 * 그 node 를 찾고, 그 node 로 향하는 항목을 모은다.
 *
 * node 는 `source_id` 를 내지 않는다. 문서 node 의 `summary` 가 파일 이름이므로 이름으로 고르고,
 * 같은 이름으로 여러 번 올린 경우는 **이 버전이 올라간 뒤에 만들어진 node 중 가장 이른 것**으로
 * 가른다. 추출은 업로드 직후 시작되기 때문이다.
 *
 * 문서 node 를 못 찾으면 `null` 이다 — 항목이 하나도 없으면 node 로 향하는 edge 도 없어서, 화면은
 * 그것을 "이 버전에서 나온 것이 없다" 로 읽는다.
 */
export function documentKnowledge(
  graph: Pick<KnowledgeGraph, 'nodes' | 'edges'>,
  document: Pick<ProjectDocument, 'fileName' | 'uploadedAt'>,
): KnowledgeNode[] | null {
  const documentIds = documentNodeIds(graph.edges)
  const uploadedAt = Date.parse(document.uploadedAt)
  const fileName = document.fileName.trim()

  const candidates = graph.nodes
    .filter((node) => documentIds.has(node.id) && node.source === 'DOCS' && node.summary.trim() === fileName)
    .map((node) => ({ node, createdAt: Date.parse(node.createdAt) }))
    .filter(({ createdAt }) => Number.isNaN(uploadedAt) || Number.isNaN(createdAt) || createdAt >= uploadedAt - CLOCK_SKEW_MS)
    .sort((a, b) => a.createdAt - b.createdAt)
  const documentNode = candidates[0]?.node
  if (documentNode === undefined) return null

  const memberIds = new Set(
    graph.edges.filter((edge) => edge.relation === 'PART_OF' && edge.to === documentNode.id).map((edge) => edge.from),
  )
  return graph.nodes
    .filter((node) => memberIds.has(node.id) && node.id !== documentNode.id)
    .sort((a, b) => tagRank(a.tag) - tagRank(b.tag) || a.summary.localeCompare(b.summary))
}

function tagRank(tag: string): number {
  const index = TAG_ORDER.indexOf(tag)
  return index === -1 ? TAG_ORDER.length : index
}

/** 색 칸(`dw-tone--*`). 모르는 태그는 "기타" 와 같은 칸에 넣는다. */
export function toneOf(tag: string): string {
  return isKnownTag(tag) ? tag : 'MISC'
}
