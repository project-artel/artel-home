import type { ContentMapScreen, ContentMapSelection } from './contentMapTypes'
import type { ScreenMapIndex } from './screenInspection'
import type {
  SceneContainerModel,
  SceneEdgeModel,
  ScreenMapModel,
  ScreenTransitionModel,
} from './screenMapLayout'

/*
 * 캔버스 옆에 서는 tree 의 모양과 키보드 규칙. React 도 DOM 도 없는 순수 함수만 있다.
 *
 * ## 왜 평평한 목록 둘이 아니라 tree 인가
 *
 * 예전 인스펙터는 씬 목록 하나와 전이 목록 둘을 따로 세웠다. 실측 빌드에서 그 둘은 씬 전이
 * 열아홉 줄과 screen transition 서른아홉 줄이고, 어느 줄이 어느 씬의 것인지 목록 자체는 말하지
 * 않는다. 그림은 이미 중첩으로 그 말을 하고 있었는데 목록만 그 구조를 버리고 있었던 셈이다.
 *
 * 그래서 그림과 같은 중첩으로 세운다.
 *
 *   ▾ Scene
 *       ▾ Screen
 *           → 그 screen 에서 나가는 screen transition
 *       → 그 scene 에서 나가는 scene edge
 *
 * ## 경계를 넘는 전이는 한 번만 선다
 *
 * `crossesScene` 인 screen transition 은 출발 화면 밑에만 놓는다. 도착 씬 밑에도 놓으면 전이
 * 하나가 둘로 읽히고, 화면 전이 39 개를 세던 사람이 목록에서 그보다 많은 줄을 보게 된다.
 * 대신 그 줄이 어느 씬으로 나가는지를 [crossesTo] 로 들려 보내 줄 안에서 말하게 한다.
 *
 * ## 왜 rows 가 평평한가
 *
 * `role="tree"` 는 중첩 `role="group"` 으로도, `aria-level` 을 단 평평한 목록으로도 쓸 수 있다.
 * 평평한 쪽을 고른 이유는 키보드 때문이다. 위/아래 화살표가 도는 순서와 DOM 순서가 같은 하나의
 * 목록에서 나오면 둘이 어긋날 자리가 없다 — 중첩으로 그리고 이동 순서를 따로 만들면, 접힌 가지가
 * 생길 때마다 두 순서가 조용히 갈라진다.
 */

/** tree 한 줄의 키이자 DOM id 의 뿌리. selection 과 1:1 로 맞아떨어진다. */
export function rowKey(selection: ContentMapSelection): string {
  return `${selection.kind}:${selection.id}`
}

/** 한 화면과, 그 화면에서 나가는 전이들. */
export type ScreenTreeNode = {
  key: string
  screen: ContentMapScreen
  transitions: readonly ScreenTransitionEntry[]
}

export type ScreenTransitionEntry = {
  key: string
  placed: ScreenTransitionModel
  /** 이 전이가 닿는 화면. 파서가 두 끝이 모두 실제 화면인 전이만 남기므로 사실상 늘 있다. */
  toScreen: ContentMapScreen | null
  /**
   * 이 전이가 나가서 닿는 씬. 씬 경계를 넘을 때만 채운다.
   *
   * 넘지 않는 전이에 같은 씬 이름을 붙이면 모든 줄이 씬 이름을 달게 되어, 정작 경계를 넘는
   * 줄이 눈에 띄지 않는다.
   */
  crossesTo: SceneContainerModel | null
}

/** 한 씬과, 그 안의 화면들과, 그 씬에서 나가는 전이들. */
export type SceneTreeNode = {
  key: string
  container: SceneContainerModel
  screens: readonly ScreenTreeNode[]
  sceneEdges: readonly SceneEdgeEntry[]
}

export type SceneEdgeEntry = {
  key: string
  placed: SceneEdgeModel
}

export type ContentMapTree = {
  scenes: readonly SceneTreeNode[]
}

/**
 * 그림과 같은 중첩으로 세운 tree.
 *
 * `ScreenMapModel` 과 그 색인만 읽는다 — 응답에서 목록을 다시 만들면 그림과 tree 가 같은 것에
 * 다른 id 를 붙이게 되고, 그러면 tree 에서 고른 것이 그림에서 안 밝혀진다.
 */
export function buildContentMapTree(model: ScreenMapModel, index: ScreenMapIndex): ContentMapTree {
  const scenes = model.containers.map((container) => {
    const screens = container.screens.map((screen) => ({
      key: rowKey({ kind: 'screen', id: screen.id }),
      screen,
      transitions: (index.outgoing.get(screen.id) ?? []).map((placed) => ({
        key: rowKey({ kind: 'screenTransition', id: placed.id }),
        placed,
        toScreen: index.screenById.get(placed.transition.toScreenId) ?? null,
        crossesTo: placed.transition.crossesScene
          ? (index.containerOfScreen.get(placed.transition.toScreenId) ?? null)
          : null,
      })),
    }))

    return {
      key: rowKey({ kind: 'scene', id: container.id }),
      container,
      screens,
      sceneEdges: (index.sceneEdgesFrom.get(container.id) ?? []).map((placed) => ({
        key: rowKey({ kind: 'sceneEdge', id: placed.id }),
        placed,
      })),
    }
  })

  return { scenes }
}

/**
 * 처음에는 아무 씬도 펼치지 않는다.
 *
 * 실측 빌드의 `TurnBattleScene` 하나가 화면 스물아홉 개를 물고 있다. 전부 펼친 채로 시작하면
 * 첫 화면이 이름 없는 화면 스물아홉 줄이 되어, tree 가 답해야 할 첫 질문인 "이 빌드에 어떤 씬이
 * 있나"가 스크롤 밖으로 밀린다. 접힌 채로 시작하면 그 답이 여덟 줄로 먼저 서고, 펼치는 것은
 * 클릭 한 번이다.
 */
export const NOTHING_EXPANDED: ReadonlySet<string> = new Set<string>()

export type TreeRowKind = ContentMapSelection['kind']

/**
 * 화면에 실제로 서는 줄 하나.
 *
 * `position` 과 `setSize` 는 `aria-posinset` / `aria-setsize` 다. 평평한 목록이라 스크린 리더가
 * 형제 수를 셀 수 없으므로 그 둘을 우리가 말해 준다.
 */
export type TreeRow = {
  key: string
  kind: TreeRowKind
  id: string
  /** `aria-level`. 씬 1, 화면과 씬 전이 2, 화면 전이 3. */
  level: number
  position: number
  setSize: number
  /** 펼칠 것이 있는 줄인가. 없으면 `aria-expanded` 를 아예 붙이지 않는다. */
  expandable: boolean
  expanded: boolean
} & TreeRowPayload

type TreeRowPayload =
  | { kind: 'scene'; scene: SceneTreeNode }
  | { kind: 'screen'; screen: ScreenTreeNode }
  | { kind: 'sceneEdge'; edge: SceneEdgeEntry }
  | { kind: 'screenTransition'; transition: ScreenTransitionEntry }

/** 줄 하나가 가리키는 선택. 그림과 tree 가 같은 값을 쓴다. */
export function rowSelection(row: TreeRow): ContentMapSelection {
  return { kind: row.kind, id: row.id }
}

/**
 * 지금 펼쳐진 상태에서 실제로 보이는 줄들, 위에서 아래 순서로.
 *
 * 한 씬의 자식은 화면이 먼저, 그 씬에서 나가는 전이가 나중이다. 화면이 먼저인 이유는 그것이
 * 씬 안의 내용이고 전이는 씬 밖으로 나가는 길이기 때문이다 — 안을 다 본 다음 밖으로 나간다.
 */
export function visibleTreeRows(
  tree: ContentMapTree,
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = []

  tree.scenes.forEach((scene, sceneIndex) => {
    const childCount = scene.screens.length + scene.sceneEdges.length
    const sceneExpanded = expanded.has(scene.key)
    rows.push({
      key: scene.key,
      kind: 'scene',
      id: scene.container.id,
      level: 1,
      position: sceneIndex + 1,
      setSize: tree.scenes.length,
      expandable: childCount > 0,
      expanded: childCount > 0 && sceneExpanded,
      scene,
    })
    if (childCount === 0 || !sceneExpanded) return

    scene.screens.forEach((screen, screenIndex) => {
      const screenExpanded = expanded.has(screen.key)
      rows.push({
        key: screen.key,
        kind: 'screen',
        id: screen.screen.id,
        level: 2,
        position: screenIndex + 1,
        setSize: childCount,
        expandable: screen.transitions.length > 0,
        expanded: screen.transitions.length > 0 && screenExpanded,
        screen,
      })
      if (screen.transitions.length === 0 || !screenExpanded) return

      screen.transitions.forEach((transition, transitionIndex) => {
        rows.push({
          key: transition.key,
          kind: 'screenTransition',
          id: transition.placed.id,
          level: 3,
          position: transitionIndex + 1,
          setSize: screen.transitions.length,
          expandable: false,
          expanded: false,
          transition,
        })
      })
    })

    scene.sceneEdges.forEach((edge, edgeIndex) => {
      rows.push({
        key: edge.key,
        kind: 'sceneEdge',
        id: edge.placed.id,
        level: 2,
        position: scene.screens.length + edgeIndex + 1,
        setSize: childCount,
        expandable: false,
        expanded: false,
        edge,
      })
    })
  })

  return rows
}

/**
 * 이 선택이 보이려면 펼쳐져 있어야 하는 줄들.
 *
 * 그림에서 무언가를 고르면 tree 는 그 줄을 밝히고 보여 줘야 하는데, 접힌 가지 안에 있으면
 * 밝힐 줄 자체가 없다. 이 함수가 그 가지를 지목한다.
 */
export function treePathTo(
  index: ScreenMapIndex,
  selection: ContentMapSelection,
): string[] {
  if (selection.kind === 'scene') return []

  if (selection.kind === 'screen') {
    const container = index.containerOfScreen.get(selection.id)
    return container === undefined ? [] : [rowKey({ kind: 'scene', id: container.id })]
  }

  if (selection.kind === 'sceneEdge') {
    const edge = findSceneEdge(index, selection.id)
    return edge === null ? [] : [rowKey({ kind: 'scene', id: edge.edge.from })]
  }

  const placed = findScreenTransition(index, selection.id)
  if (placed === null) return []
  const fromScreenId = placed.transition.fromScreenId
  const container = index.containerOfScreen.get(fromScreenId)
  const path = [rowKey({ kind: 'screen', id: fromScreenId })]
  if (container !== undefined) path.unshift(rowKey({ kind: 'scene', id: container.id }))
  return path
}

function findSceneEdge(index: ScreenMapIndex, id: string): SceneEdgeModel | null {
  for (const edges of index.sceneEdgesFrom.values()) {
    for (const placed of edges) if (placed.id === id) return placed
  }
  return null
}

function findScreenTransition(index: ScreenMapIndex, id: string): ScreenTransitionModel | null {
  for (const placed of index.outgoing.values()) {
    for (const candidate of placed) if (candidate.id === id) return candidate
  }
  return null
}

/**
 * 펼침 상태에 경로를 더한다. 이미 전부 펼쳐져 있으면 **같은 집합을 그대로 돌려준다**.
 *
 * 같은 참조를 돌려주는 것이 요점이다. 선택이 바뀔 때마다 새 `Set` 을 만들면 그것을 보는
 * effect 가 매번 다시 돌고, 스크롤을 되돌리는 effect 와 물려 무한 루프가 된다.
 *
 * 더하기만 하고 빼지 않는다. 그림에서 고른 것 때문에 사용자가 열어 둔 다른 씬을 접으면,
 * 클릭 한 번이 읽던 자리를 통째로 지운다.
 */
export function expandTreePath(
  expanded: ReadonlySet<string>,
  path: readonly string[],
): ReadonlySet<string> {
  if (path.every((key) => expanded.has(key))) return expanded
  const next = new Set(expanded)
  for (const key of path) next.add(key)
  return next
}

export function toggleTreeRow(
  expanded: ReadonlySet<string>,
  key: string,
): ReadonlySet<string> {
  const next = new Set(expanded)
  if (!next.delete(key)) next.add(key)
  return next
}

/**
 * 키 하나가 tree 에서 뜻하는 일.
 *
 * WAI-ARIA 의 tree 규칙 그대로다. 이 계산을 컴포넌트 밖에 두는 이유는, 화살표 하나가 상황에
 * 따라 다른 일을 하기 때문이다 — 오른쪽 화살표는 접힌 줄에서는 펼치고 펼쳐진 줄에서는 첫 자식으로
 * 내려간다. 그 갈림을 렌더 없이 시험할 수 있어야 한다.
 */
export type TreeCommand =
  | { action: 'focus'; key: string }
  | { action: 'expand'; key: string }
  | { action: 'collapse'; key: string }
  | { action: 'select'; key: string }

export function treeKeyCommand(
  rows: readonly TreeRow[],
  focusedKey: string | null,
  key: string,
): TreeCommand | null {
  if (rows.length === 0) return null

  if (key === 'Home') return { action: 'focus', key: rows[0].key }
  if (key === 'End') return { action: 'focus', key: rows[rows.length - 1].key }

  const at = rows.findIndex((row) => row.key === focusedKey)
  // 포커스가 아직 어느 줄에도 없으면 첫 줄부터 시작한다. 화살표를 눌렀는데 아무 일도
  // 일어나지 않으면 사용자는 tree 가 키보드를 안 받는다고 읽는다.
  if (at < 0) return { action: 'focus', key: rows[0].key }
  const row = rows[at]

  if (key === 'ArrowDown') {
    return at + 1 < rows.length ? { action: 'focus', key: rows[at + 1].key } : null
  }
  if (key === 'ArrowUp') {
    return at > 0 ? { action: 'focus', key: rows[at - 1].key } : null
  }
  if (key === 'ArrowRight') {
    if (!row.expandable) return null
    if (!row.expanded) return { action: 'expand', key: row.key }
    return at + 1 < rows.length ? { action: 'focus', key: rows[at + 1].key } : null
  }
  if (key === 'ArrowLeft') {
    if (row.expandable && row.expanded) return { action: 'collapse', key: row.key }
    const parent = parentRow(rows, at)
    return parent === null ? null : { action: 'focus', key: parent.key }
  }
  if (key === 'Enter' || key === ' ') return { action: 'select', key: row.key }

  return null
}

/** 위로 올라가면서 처음 만나는 더 얕은 줄. 평평한 목록에서 부모는 그것뿐이다. */
function parentRow(rows: readonly TreeRow[], at: number): TreeRow | null {
  for (let cursor = at - 1; cursor >= 0; cursor -= 1) {
    if (rows[cursor].level < rows[at].level) return rows[cursor]
  }
  return null
}
