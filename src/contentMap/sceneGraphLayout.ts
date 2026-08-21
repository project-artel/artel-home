import { layoutGraph, type GraphLayout } from '../knowledge/knowledgeLayout'
import { edgeSourceStyle, type ContentMapScene, type SceneTransition } from './contentMapTypes'
import type { EdgeSourceStyle } from './contentMapTypes'

/*
 * 씬 전이 그래프의 모델과 배치.
 *
 * 좌표를 계산하는 일은 `knowledge/knowledgeLayout.ts` 가 이미 하고 있고, 그
 * 모듈은 노드에서 `id` 하나, 엣지에서 `from`/`to` 한 쌍만 읽는다. 그래서
 * 여기서 하는 일은 기하가 아니라 **해석**이다: 응답의 전이 목록을 그릴 수
 * 있는 노드/엣지 쌍으로 바꾸는 것.
 *
 * 어려운 부분은 목적지다. 명세상 `toSceneId` 는 null 일 수 있고, 그때
 * 목적지는 이름으로만 알려져 있다. 그 전이를 버리면 화면은 "이 씬에서
 * 나가는 길이 없다"고 말하게 되는데, 그건 사실이 아니다. 그래서 이름만 있는
 * 목적지에는 자리표시 노드를 만들어 준다 — 콘텐츠 맵에 아직 없는 씬으로
 * 가는 길이 있다는 사실 자체가 이 화면이 보여 줘야 하는 것이다.
 *
 * 순수 함수만 있다. React 도 DOM 도 시계도 없어서, 자기 자신으로 가는 전이,
 * 같은 쌍의 전이 여러 개, 빈 그래프 같은 조용히 틀리는 경우를 렌더 없이
 * 시험할 수 있다.
 */

/**
 * 노드 하나.
 *
 * `scene` 이 null 이면 이 응답의 씬 목록에 없는 목적지다. 실제 씬과 섞이지
 * 않도록 id 에 접두사를 붙인다 — 씬 id 는 서버가 준 Long 문자열이고
 * 이름은 사람이 지은 문자열이라, 접두사가 없으면 이름이 `12` 인 씬 하나가
 * id 12 인 씬을 덮어쓸 수 있다.
 */
export type SceneNode = {
  id: string
  /** 화면에 쓰는 이름. 씬이 이름을 안 줬으면 빈 문자열이다. */
  name: string
  scene: ContentMapScene | null
  /**
   * 서버가 목적지 씬 id 는 줬지만 그 씬이 `scenes` 에 없을 때 true.
   * `scene === null` 인 두 가지 이유를 구분한다: 이름만 아는 것과,
   * id 는 아는데 응답에서 빠진 것.
   */
  missingFromResponse: boolean
}

export type SceneEdge = {
  from: string
  to: string
  transition: SceneTransition
  style: EdgeSourceStyle
}

export type SceneGraphModel = {
  nodes: SceneNode[]
  edges: SceneEdge[]
  /**
   * 전이가 가리켰지만 `scenes` 가 설명하지 않은 노드 수. 화면이 그대로
   * 인용한다 — 자리표시 마름모가 몇 개인지 세는 것보다 정확하다.
   */
  unmappedScenes: number
}

export type SceneGraphLayout = GraphLayout<SceneNode, SceneEdge>

/** 실제 씬의 노드 id. */
function sceneNodeId(sceneId: string): string {
  return `scene:${sceneId}`
}

/** 이름으로만 아는 목적지의 노드 id. */
function nameNodeId(name: string): string {
  return `name:${name}`
}

/**
 * 응답을 그릴 수 있는 그래프로 바꾼다.
 *
 * 목적지 해석 순서는 좁은 쪽부터다:
 *
 *   1. `toSceneId` 가 있고 그 씬이 응답에 있으면 그 씬.
 *   2. `toSceneId` 는 있는데 응답에 그 씬이 없으면, 그 id 로 자리표시 노드를
 *      만든다. 서버가 씬 하나를 빼먹었다는 뜻이고, 조용히 지우면 그래프가
 *      끊어진 이유를 아무도 알 수 없다.
 *   3. `toSceneId` 가 없으면 이름으로 씬을 찾는다. 이름이 겹치면 첫 번째를
 *      쓴다 — Unity 씬 이름은 유일할 것으로 기대되지만 그건 우리가 강제할
 *      수 있는 규칙이 아니고, 임의로 고르는 것보다 결정적인 편이 낫다.
 *   4. 그래도 못 찾으면 그 이름의 자리표시 노드. 이름조차 비어 있으면 전부
 *      하나의 "목적지 미상" 노드로 모인다 — 화살표 없는 전이 목록보다
 *      "여기서 어딘가로 가는 길이 n 개 있다"가 더 정직하다.
 */
export function buildSceneGraph(
  scenes: readonly ContentMapScene[],
  transitions: readonly SceneTransition[],
): SceneGraphModel {
  const nodes: SceneNode[] = scenes.map((scene) => ({
    id: sceneNodeId(scene.id),
    name: scene.name,
    scene,
    missingFromResponse: false,
  }))

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const byName = new Map<string, SceneNode>()
  for (const node of nodes) {
    if (node.name.length > 0 && !byName.has(node.name)) byName.set(node.name, node)
  }

  let unmappedScenes = 0

  /**
   * 자리표시 노드를 만들거나, 그 id 의 노드가 이미 있으면 그것을 돌려준다.
   *
   * 이름이 비어 있던 노드에 뒤늦게 이름이 들어오면 채워 넣는다. 출발 씬
   * 자리표시는 이름 없이 먼저 생기는데, 같은 씬을 `toSceneName` 과 함께
   * 가리키는 전이가 뒤에 오면 그 이름이 버려진다. 그러면 같은 응답이라도
   * 전이 순서에 따라 이름이 있는 노드가 되기도, 빈 이름이 되기도 한다.
   */
  function placeholder(id: string, name: string, missingFromResponse: boolean): SceneNode {
    const existing = byId.get(id)
    if (existing !== undefined) {
      if (existing.name.length === 0 && name.length > 0) existing.name = name
      return existing
    }

    const node: SceneNode = { id, name, scene: null, missingFromResponse }
    byId.set(id, node)
    nodes.push(node)
    unmappedScenes += 1
    return node
  }

  function destination(transition: SceneTransition): SceneNode {
    if (transition.toSceneId !== null) {
      // 응답에 이미 있는 씬이면 `placeholder` 가 그 노드를 그대로 돌려주므로
      // `unmappedScenes` 는 여기서도 새로 만든 노드만 센다.
      return placeholder(sceneNodeId(transition.toSceneId), transition.toSceneName, true)
    }

    const named = byName.get(transition.toSceneName)
    if (named !== undefined) return named

    return placeholder(nameNodeId(transition.toSceneName), transition.toSceneName, false)
  }

  const edges: SceneEdge[] = []
  for (const transition of transitions) {
    const from = byId.get(sceneNodeId(transition.fromSceneId))
    // 출발 씬이 응답에 없으면 자리표시로 만들어 준다. 그 전이를 지우면
    // 능력 개수는 맞는데 그래프만 조용히 비는 화면이 된다.
    const source =
      from ?? placeholder(sceneNodeId(transition.fromSceneId), '', true)

    edges.push({
      from: source.id,
      to: destination(transition).id,
      transition,
      style: edgeSourceStyle(transition.source),
    })
  }

  return { nodes, edges, unmappedScenes }
}

/** 모델을 좌표로. 결정적이므로 같은 응답은 언제나 같은 그림이 된다. */
export function layoutSceneGraph(model: SceneGraphModel): SceneGraphLayout {
  return layoutGraph<SceneNode, SceneEdge>(model)
}

/**
 * 한 씬에서 나가는 전이와 들어오는 전이를, 반대편 노드까지 붙여서.
 *
 * 접근 가능한 목록이 이걸로 만들어진다. SVG 는 `aria-hidden` 이라 이 목록이
 * 키보드와 스크린 리더가 그래프를 읽는 유일한 경로다.
 */
export type SceneIncidence = {
  edge: SceneEdge
  direction: 'out' | 'in' | 'self'
  other: SceneNode
}

/**
 * 노드별 인접 전이를, 한 번의 순회로 전부.
 *
 * 노드마다 따로 물으면 목록을 그리는 데 O(노드 × 엣지)가 든다. 목록은 모든
 * 노드를 한 번에 그리므로 한 번에 만들어 두고 나눠 쓴다.
 */
export function incidenceByNode(model: SceneGraphModel): Map<string, SceneIncidence[]> {
  const byId = new Map(model.nodes.map((node) => [node.id, node]))
  const grouped = new Map<string, SceneIncidence[]>()

  function add(nodeId: string, incidence: SceneIncidence): void {
    const list = grouped.get(nodeId)
    if (list === undefined) grouped.set(nodeId, [incidence])
    else list.push(incidence)
  }

  for (const edge of model.edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (from === undefined || to === undefined) continue

    if (edge.from === edge.to) {
      // 자기 자신으로 가는 전이는 한 번만 센다. 나가고 들어오는 것으로 두 번
      // 세면 목록이 없는 전이를 하나 더 있다고 말한다.
      add(edge.from, { edge, direction: 'self', other: to })
      continue
    }

    add(edge.from, { edge, direction: 'out', other: to })
    add(edge.to, { edge, direction: 'in', other: from })
  }

  return grouped
}
