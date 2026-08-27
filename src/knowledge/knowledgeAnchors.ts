import type { KnowledgeNode } from './knowledgeTypes'

/*
 * Narrowing the item list to one scene.
 *
 * 지식은 두 종류다. 게임 어디서나 참인 것(`anchor` 없음, 보통)과 한 씬에서만 참인 것(`anchor` 있음).
 * 목록을 씬 하나로 좁히는 일도, `anchor` 없는 것만 모아 보는 일도 여기 순수 함수가 답한다 —
 * 컴포넌트가 아니라 여기 있어야 테스트가 붙는다.
 */

/** Every item, anchored or not. */
export const SCENE_FILTER_ALL = 'ALL'

/**
 * Only the items with no anchor at all.
 *
 * `anchor` 가 빠진 항목을 사람이 찾는 통로다. 씬 하나를 고르는 것만으로는 "여기 있어야 하는데
 * `anchor` 가 없는 것"을 볼 수 없다.
 */
export const SCENE_FILTER_GAME_WIDE = 'GAME_WIDE'

const SCENE_FILTER_PREFIX = 'SCENE:'

/**
 * The `<option>` value for one scene.
 *
 * 접두사를 붙이는 이유: 씬 이름이 `ALL` 인 빌드가 있어도 "전체"와 섞이지 않는다.
 */
export function sceneFilterValue(sceneName: string): string {
  return `${SCENE_FILTER_PREFIX}${sceneName}`
}

/** Every scene any item is anchored to, deduplicated and ordered. */
export function anchoredSceneNames(nodes: readonly KnowledgeNode[]): string[] {
  const names = new Set<string>()
  for (const node of nodes) {
    for (const anchor of node.anchors) names.add(anchor.sceneName)
  }
  // Plain sort, not `localeCompare`: the order has to be the same everywhere,
  // and scene names are build identifiers rather than prose.
  return [...names].sort()
}

/** Whether the item belongs in the list under the given filter value. */
export function matchesSceneFilter(node: KnowledgeNode, filter: string): boolean {
  if (filter === SCENE_FILTER_ALL) return true
  if (filter === SCENE_FILTER_GAME_WIDE) return node.anchors.length === 0
  if (!filter.startsWith(SCENE_FILTER_PREFIX)) return true
  const sceneName = filter.slice(SCENE_FILTER_PREFIX.length)
  return node.anchors.some((anchor) => anchor.sceneName === sceneName)
}
