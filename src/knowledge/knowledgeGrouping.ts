import { matchesSceneFilter } from './knowledgeAnchors'
import { documentNodeIds, type KnowledgeEdge, type KnowledgeNode } from './knowledgeTypes'

/**
 * 왼쪽 탐색기가 항목을 묶고 거르고 줄 세우는 계산(ARTEL-1190). 그래프 응답만 읽고, 레이아웃과는 상관없다.
 *
 * 묶는 기준이 셋인 이유: 같은 지식을 묻는 질문이 다르다. "규칙이 몇 개냐" 는 종류로, "이 기획서에서 무엇을 뽑았나" 는
 * 문서로, "이 씬에서 참인 것이 뭐냐" 는 씬으로 본다. 노드는 최대 200개라 묶음을 접어야 훑을 수 있다.
 */

export type GroupMode = 'tag' | 'document' | 'scene'
export type SortMode = 'degree' | 'recent' | 'name'

export type ExplorerItem = { node: KnowledgeNode; degree: number }

/**
 * 묶음 하나. `kind` 가 이름을 정한다 — 화면이 i18n 으로 바꾼다.
 * - `tag` · `scene`: `name` 이 그 종류 값 · 씬 이름
 * - `document`: `nodeId` 가 그 문서 노드, `name` 은 그 노드의 요약(파일 이름)
 * - `observed`: 런에서 관측해 어느 문서에도 속하지 않은 항목
 * - `unfiled`: 문서에서 뽑았는데 문서 노드에 이어지지 않은 항목
 * - `gameWide`: 걸린 씬이 없는 항목(게임 전체에서 참)
 */
export type ExplorerGroup = {
  key: string
  kind: 'tag' | 'document' | 'observed' | 'unfiled' | 'scene' | 'gameWide'
  name: string
  nodeId: string | null
  items: ExplorerItem[]
}

export type ExplorerQuery = {
  mode: GroupMode
  sort: SortMode
  /** 비어 있으면 모든 종류. */
  tags: ReadonlySet<string>
  /** 이름 · 요약에 들어 있어야 하는 글자. 대소문자를 가리지 않는다. */
  text: string
  /** `knowledgeAnchors` 의 씬 거르기 값. */
  sceneFilter: string
}

export type ExplorerResult = {
  groups: ExplorerGroup[]
  /** 거른 뒤 남은 항목 수. 씬으로 묶으면 한 항목이 여러 묶음에 나올 수 있어 묶음 합과 다를 수 있다. */
  shown: number
  total: number
  /** 거르기 전 종류별 수. 칩에 쓴다. */
  tagCounts: Map<string, number>
}

/** 항목마다 닿은 관계 수. 자기 자신으로 가는 관계는 한 번만 센다. */
export function degreesOf(nodes: readonly KnowledgeNode[], edges: readonly KnowledgeEdge[]): Map<string, number> {
  const degree = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
    if (edge.to !== edge.from) degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
  }
  return degree
}

export function exploreKnowledge(
  nodes: readonly KnowledgeNode[],
  edges: readonly KnowledgeEdge[],
  query: ExplorerQuery,
  titleOf: (node: KnowledgeNode) => string,
): ExplorerResult {
  const degree = degreesOf(nodes, edges)
  const tagCounts = new Map<string, number>()
  for (const node of nodes) tagCounts.set(node.tag, (tagCounts.get(node.tag) ?? 0) + 1)

  const needle = query.text.trim().toLowerCase()
  const kept = nodes.filter(
    (node) =>
      (query.tags.size === 0 || query.tags.has(node.tag)) &&
      matchesSceneFilter(node, query.sceneFilter) &&
      (needle.length === 0 ||
        titleOf(node).toLowerCase().includes(needle) ||
        node.summary.toLowerCase().includes(needle)),
  )
  const itemOf = (node: KnowledgeNode): ExplorerItem => ({ node, degree: degree.get(node.id) ?? 0 })

  const groups =
    query.mode === 'tag'
      ? byTag(kept, itemOf)
      : query.mode === 'document'
        ? byDocument(kept, nodes, edges, itemOf, titleOf)
        : byScene(kept, itemOf)

  for (const group of groups) {
    group.items.sort(compareBy(query.sort, titleOf))
    // 문서 노드는 정렬과 상관없이 자기 묶음의 맨 앞이다.
    if (group.kind === 'document') {
      const head = group.items.findIndex((item) => item.node.id === group.nodeId)
      if (head > 0) group.items.unshift(...group.items.splice(head, 1))
    }
  }
  return { groups: groups.filter((group) => group.items.length > 0), shown: kept.length, total: nodes.length, tagCounts }
}

function byTag(kept: readonly KnowledgeNode[], itemOf: (node: KnowledgeNode) => ExplorerItem): ExplorerGroup[] {
  const groups = new Map<string, ExplorerGroup>()
  for (const node of kept) {
    const group = groups.get(node.tag) ?? { key: `tag:${node.tag}`, kind: 'tag', name: node.tag, nodeId: null, items: [] }
    group.items.push(itemOf(node))
    groups.set(node.tag, group)
  }
  // 많은 묶음이 위. 같으면 종류 이름 순으로 늘 같은 자리에 둔다.
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name))
}

function byDocument(
  kept: readonly KnowledgeNode[],
  nodes: readonly KnowledgeNode[],
  edges: readonly KnowledgeEdge[],
  itemOf: (node: KnowledgeNode) => ExplorerItem,
  titleOf: (node: KnowledgeNode) => string,
): ExplorerGroup[] {
  const documents = documentNodeIds(edges)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  // 항목 → 그 항목이 속한 첫 문서. `PART_OF` 는 늘 항목에서 문서로 간다(`documentNodeIds`).
  const parent = new Map<string, string>()
  for (const edge of edges) {
    if (edge.relation === 'PART_OF' && !parent.has(edge.from)) parent.set(edge.from, edge.to)
  }

  const docGroups = new Map<string, ExplorerGroup>()
  const documentGroup = (documentId: string) => {
    const existing = docGroups.get(documentId)
    if (existing !== undefined) return existing
    const documentNode = byId.get(documentId)
    const created: ExplorerGroup = {
      key: `document:${documentId}`,
      kind: 'document',
      name: documentNode === undefined ? `#${documentId}` : titleOf(documentNode),
      nodeId: documentId,
      items: [],
    }
    docGroups.set(documentId, created)
    return created
  }
  const observed: ExplorerGroup = { key: 'observed', kind: 'observed', name: '', nodeId: null, items: [] }
  const unfiled: ExplorerGroup = { key: 'unfiled', kind: 'unfiled', name: '', nodeId: null, items: [] }

  for (const node of kept) {
    // 문서 노드는 자기 묶음의 맨 앞에 선다. 그 묶음을 펼치면 파일과 거기서 뽑은 것이 함께 보인다.
    if (documents.has(node.id)) documentGroup(node.id).items.push(itemOf(node))
    else if (parent.has(node.id)) documentGroup(parent.get(node.id)!).items.push(itemOf(node))
    else if (node.source === 'QA') observed.items.push(itemOf(node))
    else unfiled.items.push(itemOf(node))
  }

  const ordered = [...docGroups.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name))
  return [...ordered, observed, unfiled]
}

function byScene(kept: readonly KnowledgeNode[], itemOf: (node: KnowledgeNode) => ExplorerItem): ExplorerGroup[] {
  const scenes = new Map<string, ExplorerGroup>()
  const gameWide: ExplorerGroup = { key: 'gameWide', kind: 'gameWide', name: '', nodeId: null, items: [] }
  for (const node of kept) {
    if (node.anchors.length === 0) {
      gameWide.items.push(itemOf(node))
      continue
    }
    // 여러 씬에 걸린 항목은 그 씬마다 보인다. 한 씬에서만 찾으면 다른 씬에서 참인 사실을 놓친다.
    for (const sceneName of new Set(node.anchors.map((anchor) => anchor.sceneName))) {
      const group = scenes.get(sceneName) ?? { key: `scene:${sceneName}`, kind: 'scene', name: sceneName, nodeId: null, items: [] }
      group.items.push(itemOf(node))
      scenes.set(sceneName, group)
    }
  }
  // 씬 이름은 빌드 식별자라 그냥 정렬한다(`anchoredSceneNames` 와 같은 이유).
  return [...[...scenes.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)), gameWide]
}

function compareBy(sort: SortMode, titleOf: (node: KnowledgeNode) => string) {
  const byName = (a: ExplorerItem, b: ExplorerItem) => titleOf(a.node).localeCompare(titleOf(b.node))
  if (sort === 'name') return byName
  if (sort === 'recent') return (a: ExplorerItem, b: ExplorerItem) => b.node.createdAt.localeCompare(a.node.createdAt) || byName(a, b)
  return (a: ExplorerItem, b: ExplorerItem) => b.degree - a.degree || byName(a, b)
}
