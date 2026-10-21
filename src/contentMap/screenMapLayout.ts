import type {
  ContentMapScene,
  ContentMapScreen,
  SceneTransition,
  ScreenTransition,
} from './contentMapTypes'
import { buildSceneGraph, type SceneEdge, type SceneNode } from './sceneGraphLayout'

/*
 * 씬 컨테이너 안에 화면을 중첩해 놓는 배치.
 *
 * ## 왜 `knowledgeLayout` 을 다시 쓰지 않는가
 *
 * 그 모듈은 이미 결정적이다 — union-find 로 컴포넌트를 가르고, BFS 로 링을 매기고, shelf 로
 * 채운다. 다시 쓰지 않는 이유는 안정성이 아니라 **모양**이다. 거기서 노드는 반지름
 * `NODE_RADIUS` 하나짜리 점이고, 링 위의 각도 계산도 화살촉이 물러설 거리도 전부 그 하나에서
 * 나온다. 여기서 노드는 안에 든 화면 수만큼 커지는 상자다. 점을 전제한 기하에 크기가 제각각인
 * 상자를 넣으면 이웃끼리 겹치기 시작하고, 그 겹침은 링 반지름을 키워도 사라지지 않는다.
 *
 * ## 안쪽 먼저, 바깥 나중
 *
 *   1. 씬마다 그 안의 화면을 격자로 놓아 **상자 크기를 구한다**.
 *   2. 그 상자를 노드 크기로 삼아 바깥 씬 그래프를 layer 로 쌓는다.
 *
 * 순서가 반대일 수 없다. 바깥을 먼저 놓으면 상자가 얼마나 커질지 모르는 채로 자리를 정하는
 * 것이라, 화면이 여섯 개인 씬이 이웃을 덮는다.
 *
 * ## 왜 반복이 없는가
 *
 * 같은 응답을 두 번 그리면 같은 좌표가 나와야 한다. 그래야 두 빌드를 나란히 비교할 수 있고,
 * 어제 붙인 스크린샷이 오늘도 같은 그림이다. 그래서 난수도, 반복 완화도, 시계도 없다.
 * 서버가 준 배열 순서에도 기대지 않는다 — 정렬 키를 전부 데이터에서 뽑는다.
 *
 * React 도 DOM 도 없는 순수 함수만 있다. 조용히 틀리는 경우 — 화면이 0 개인 씬, 자기 자신으로
 * 가는 전이, 같은 두 화면 사이의 전이 여럿, 순환뿐이라 root 가 없는 그래프 — 를 렌더 없이
 * 시험할 수 있다.
 */

/**
 * 화면 노드 하나의 크기.
 *
 * 위 `SCREEN_IMAGE_HEIGHT` 자리에 화면 캡처가 앉고, 그 아래 남는 띠에 이름 한 줄과
 * `discriminator` 한 줄이 들어간다. 두 화면이 왜 둘인지를 말하는 것은 그 아래 줄이므로,
 * 상자가 그 줄을 넘치지 않을 만큼은 넓어야 한다. 글자 띠 높이는 `SCREEN_HEIGHT -
 * SCREEN_IMAGE_HEIGHT` 로 나오므로 네 번째 상수를 따로 두지 않는다 — 두면 세 값이
 * 어긋날 자리만 생긴다.
 */
export const SCREEN_WIDTH = 176
export const SCREEN_IMAGE_HEIGHT = 100
export const SCREEN_HEIGHT = 134

/** 격자 안에서 화면끼리 벌어지는 거리. */
const SCREEN_GAP_X = 14
const SCREEN_GAP_Y = 14

/** 컨테이너 테두리와 안쪽 내용 사이. */
const CONTAINER_PADDING = 14

/**
 * 컨테이너 머리글이 차지하는 높이. 이름 한 줄(26) 아래에 능력 · 전이 수 한 줄(ARTEL-1172)이 선다 — 상자만 보고도
 * 이 씬에서 무엇을 할 수 있고 몇 길로 오가는지 읽히게.
 */
export const CONTAINER_HEADER = 52

/**
 * 화면이 하나도 없는 씬의 몸통 높이.
 *
 * 0 으로 두면 컨테이너가 머리글만 남아 다른 화면의 씬 카드와 구별되지 않는다. 빈 몸통이
 * 남아야 캔버스가 거기에 "아직 관측된 화면이 없다"를 쓸 자리가 생기고, 그 문장이 이 상태를
 * 오류가 아니라 정상으로 읽게 한다.
 */
const EMPTY_BODY_HEIGHT = 34

/** 컨테이너의 최소 폭. 화면 하나와 씬 이름, 능력 · 전이 수 한 줄이 다 들어갈 만큼. */
const MIN_CONTAINER_WIDTH = Math.max(SCREEN_WIDTH + CONTAINER_PADDING * 2, 236)

/**
 * layer 사이의 가로 간격. 여기에 씬 전이가 가로로 지나가고 그 위에 조건 한 줄이 앉는다.
 * 세로 간격이던 시절의 88 은 두 layer 사이에 글자가 들어갈 높이였을 뿐이라, 가로에서는
 * 전이 라벨의 폭을 감당하지 못한다.
 */
const LAYER_GAP = 120

/**
 * 같은 layer(열) 안에서 컨테이너끼리 벌어지는 세로 거리. 자기 자신으로 가는 고리가 상자
 * 위쪽으로 자라므로(`selfLink` 참조), 열 안에서 위 이웃과의 거리가 고리가 올라오는 높이보다
 * 커야 한다. 64 는 **첫 고리**를 덮는 값이다 — 반지름 22 에 라벨까지 37px 이다.
 *
 * 한 씬에서 자기 자신으로 가는 전이가 셋 이상이면 세 번째 고리의 라벨이 68px 로 이 간격을
 * 넘어 위 이웃에 닿는다. 그 경우까지 덮으려고 간격을 키우지 않는 것은, 씬 하나에 자기 전이가
 * 셋 넘게 달리는 일보다 모든 열이 늘 벌어지는 비용이 크기 때문이다.
 */
const SIBLING_GAP = 64

/** 그림 전체를 두르는 여백. */
const PADDING = 44

/** 같은 두 끝을 잇는 선이 여럿일 때 부채꼴로 벌어지는 폭. */
const CURVE_STEP = 24

/** 화살촉이 상자에 묻히지 않도록 물러서는 거리. */
const ARROW_CLEARANCE = 5

/** 자기 자신으로 가는 선의 고리 반지름. 겹치는 것마다 이만큼 자란다. */
const SELF_LOOP_RADIUS = 22

export type ScreenMapModel = {
  /** 씬 하나가 컨테이너 하나. 응답의 씬이 먼저 오고, 전이만 가리킨 자리표시가 뒤에 온다. */
  containers: SceneContainerModel[]
  sceneEdges: SceneEdgeModel[]
  screenTransitions: ScreenTransitionModel[]
  /** 전이가 가리켰지만 `scenes` 가 설명하지 않은 컨테이너 수. */
  unmappedScenes: number
  /** 모든 컨테이너의 화면을 합한 수. 0 이면 아직 QA 런이 없는 정상 상태다. */
  screenCount: number
}

export type SceneContainerModel = {
  /** `sceneGraphLayout` 의 노드 id 와 같은 값이다. 씬 간선의 두 끝이 이것을 가리킨다. */
  id: string
  node: SceneNode
  /** 이 씬의 화면들, 정렬된 뒤. */
  screens: ContentMapScreen[]
}

export type SceneEdgeModel = {
  /**
   * 선택과 React key 로 쓰는 값.
   *
   * `SceneTransition` 에는 서버가 준 id 가 없다. 대신 파서가 이미 유일하게 접어 둔 네 값을
   * 그대로 쓴다 — 배열 위치로 만들면 응답 순서가 바뀌는 날 선택이 다른 간선으로 옮겨간다.
   */
  id: string
  edge: SceneEdge
}

export type ScreenTransitionModel = {
  id: string
  transition: ScreenTransition
}

/** 한 화면이 놓인 자리. `x`/`y` 는 좌상단이고 그림 전체 좌표계다. */
export type PlacedScreen = {
  screen: ContentMapScreen
  x: number
  y: number
  width: number
  height: number
}

/** 한 씬 컨테이너가 놓인 자리. `x`/`y` 는 좌상단이고 그림 전체 좌표계다. */
export type PlacedContainer = {
  id: string
  node: SceneNode
  x: number
  y: number
  width: number
  height: number
  screens: PlacedScreen[]
  /** entry 씬에서 몇 걸음 떨어졌나. 0 이 entry 다. */
  layer: number
}

type Drawn = {
  /** `d` 로 쓰는 곡선. */
  path: string
  /** 라벨과 표식이 앉는 자리: 그려진 곡선의 중점. */
  midX: number
  midY: number
  /** 두 끝이 같은 것이라 고리로 그렸나. */
  loop: boolean
}

export type PlacedSceneEdge = Drawn & {
  id: string
  edge: SceneEdge
}

export type PlacedScreenTransition = Drawn & {
  id: string
  transition: ScreenTransition
  /**
   * 두 끝이 실제로 다른 컨테이너에 놓였나.
   *
   * 서버의 `crossesScene` 과 따로 계산한다. 그림이 경계를 넘는지는 배치가 정하는 사실이고,
   * 서버가 말하는 것은 두 화면이 다른 씬에 속하는지다. 둘이 어긋나면 그 어긋남 자체가 보여야
   * 하므로 한쪽을 다른 쪽으로 덮지 않는다.
   */
  crossesContainer: boolean
}

export type ScreenMapLayout = {
  containers: PlacedContainer[]
  sceneEdges: PlacedSceneEdge[]
  screenTransitions: PlacedScreenTransition[]
  /** `x y w h`. 컨테이너가 하나도 없어도 `0 0 0 0` 은 내지 않는다. */
  viewBox: string
  width: number
  height: number
  /** entry 에서 가장 먼 씬까지의 걸음 수 + 1. */
  layerCount: number
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 두 id 를 정렬하는 순서.
 *
 * 서버는 id 를 Long 으로 보내고 파서가 문자열로 정규화한다. 문자열로만 비교하면 `10` 이 `9`
 * 앞에 서서, 화면 열 개짜리 씬에서 격자 순서가 사람이 기대하는 것과 어긋난다. 둘 다 숫자로
 * 읽히면 숫자로, 아니면 문자열로 — 어느 쪽이든 같은 입력은 같은 순서다.
 */
function compareIds(left: string, right: string): number {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  const numeric =
    left.length > 0 &&
    right.length > 0 &&
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber)
  if (numeric && leftNumber !== rightNumber) return leftNumber - rightNumber
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * 씬 간선 하나를 가리키는 값.
 *
 * 파서가 같은 네 값을 가진 전이를 이미 하나로 접었으므로 이 문자열은 응답 안에서 유일하다.
 * 배열 위치가 아니라 내용에서 나오기 때문에, 서버가 전이를 다른 순서로 보내도 같은 간선은
 * 같은 id 를 갖고 부채꼴의 자리도 바뀌지 않는다.
 */
function sceneEdgeId(edge: SceneEdge): string {
  const { transition } = edge
  return `sceneEdge:${edge.from}>${edge.to}|${transition.capabilityId ?? ''}|${transition.source}`
}

/**
 * 응답을 컨테이너와 두 종류의 선으로 바꾼다.
 *
 * 바깥 그래프는 `buildSceneGraph` 가 이미 만든다 — 목적지가 id 로도 이름으로도 올 수 있고
 * 응답에 없는 씬을 가리킬 수도 있다는 까다로운 부분이 거기서 이미 풀렸고, 그 규칙을 여기에
 * 다시 적으면 두 그림이 같은 응답을 다르게 읽기 시작한다.
 *
 * 화면은 씬 객체 안에 들어 있으므로 그 중첩이 곧 소속이다. `screen.sceneId` 로 다시 찾지
 * 않는 이유는 응답의 두 자리가 어긋날 때 어느 쪽을 믿을지 정해야 하는데, 응답 구조 자체가
 * 더 강한 진술이기 때문이다.
 */
export function buildScreenMap(
  scenes: readonly ContentMapScene[],
  edges: readonly SceneTransition[],
  screenTransitions: readonly ScreenTransition[],
): ScreenMapModel {
  const graph = buildSceneGraph(scenes, edges)

  const containers: SceneContainerModel[] = graph.nodes.map((node) => ({
    id: node.id,
    node,
    screens: [...(node.scene?.screens ?? [])].sort((left, right) => compareIds(left.id, right.id)),
  }))

  const sceneEdges: SceneEdgeModel[] = graph.edges
    .map((edge) => ({ id: sceneEdgeId(edge), edge }))
    .sort((left, right) => (left.id === right.id ? 0 : left.id < right.id ? -1 : 1))

  const transitions: ScreenTransitionModel[] = [...screenTransitions]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((transition) => ({ id: `screenTransition:${transition.id}`, transition }))

  return {
    containers,
    sceneEdges,
    screenTransitions: transitions,
    unmappedScenes: graph.unmappedScenes,
    screenCount: containers.reduce((sum, container) => sum + container.screens.length, 0),
  }
}

type Box = { width: number; height: number; screens: { x: number; y: number }[] }

/**
 * 컨테이너 하나의 크기와, 그 안 화면들의 상대 좌표.
 *
 * 열 수를 `ceil(sqrt(n))` 으로 잡는 것은 상자를 정사각형에 가깝게 두기 위해서다. 한 줄로
 * 늘어놓으면 화면 여섯 개짜리 씬 하나가 그림 전체를 옆으로 늘려, 나머지 씬이 전부 작아진다.
 *
 * **씬마다 화면 수가 크게 다른 것이 정상이다.** 한 씬에서만 오버레이가 여럿 갈리고, 판정
 * 임계값에 따라 같은 씬이 화면 셋이 되기도 스물이 되기도 한다. `sqrt` 는 그 스물을 5 × 4 로
 * 접어 폭과 높이가 함께 자라게 한다 — 한 줄이었다면 폭만 스무 배가 되어 이웃 씬이 전부
 * 점으로 줄어들었을 것이다. 그래도 그 컨테이너가 줄에서 가장 큰 것은 사실이고, 그것을 작게
 * 보이도록 접는 것은 데이터를 숨기는 일이다.
 */
function measureContainer(screens: readonly ContentMapScreen[]): Box {
  if (screens.length === 0) {
    return {
      width: MIN_CONTAINER_WIDTH,
      height: CONTAINER_PADDING * 2 + CONTAINER_HEADER + EMPTY_BODY_HEIGHT,
      screens: [],
    }
  }

  const columns = Math.ceil(Math.sqrt(screens.length))
  const rows = Math.ceil(screens.length / columns)
  const bodyWidth = columns * SCREEN_WIDTH + (columns - 1) * SCREEN_GAP_X
  const bodyHeight = rows * SCREEN_HEIGHT + (rows - 1) * SCREEN_GAP_Y

  const width = Math.max(MIN_CONTAINER_WIDTH, bodyWidth + CONTAINER_PADDING * 2)
  const height = CONTAINER_PADDING * 2 + CONTAINER_HEADER + bodyHeight
  // 마지막 줄이 덜 찼을 때 격자가 왼쪽으로 쏠리지 않도록 몸통을 가운데에 둔다.
  const left = (width - bodyWidth) / 2

  return {
    width,
    height,
    screens: screens.map((_, index) => ({
      x: left + (index % columns) * (SCREEN_WIDTH + SCREEN_GAP_X),
      y: CONTAINER_PADDING + CONTAINER_HEADER + Math.floor(index / columns) * (SCREEN_HEIGHT + SCREEN_GAP_Y),
    })),
  }
}

/**
 * 컨테이너를 layer 로 가른다.
 *
 * entry 는 들어오는 씬 간선이 없는 씬이다. 상태 머신을 왼쪽에서 오른쪽으로 읽는 그림에서 그것이
 * 시작점이고, 여럿이면 전부 첫 layer 에 선다. 하나도 없으면 그래프가 순환뿐이라는 뜻이고, 그때는
 * 입력 순서의 첫 씬을 시작점으로 삼는다 — 임의로 고르는 것보다 결정적인 편이 낫다.
 *
 * root 에서 못 닿는 씬이 남으면 남은 것 중 가장 앞의 것을 새 root 로 잡아 다시 돈다. 그
 * 씬들을 버리면 "이 빌드에 씬이 몇 개인가"에 그림이 다른 답을 하게 된다.
 */
function assignLayers(containers: readonly SceneContainerModel[], edges: readonly SceneEdgeModel[]): number[] {
  const indexById = new Map(containers.map((container, index) => [container.id, index]))
  const outgoing: number[][] = containers.map(() => [])
  const indegree = containers.map(() => 0)

  for (const { edge } of edges) {
    const from = indexById.get(edge.from)
    const to = indexById.get(edge.to)
    if (from === undefined || to === undefined || from === to) continue
    if (!outgoing[from].includes(to)) outgoing[from].push(to)
    indegree[to] += 1
  }

  const layer = containers.map(() => -1)

  function walk(seeds: readonly number[]): void {
    let frontier = seeds.filter((index) => layer[index] === -1)
    for (const index of frontier) layer[index] = 0
    let depth = 0

    while (frontier.length > 0) {
      depth += 1
      const next: number[] = []
      for (const index of frontier) {
        // 정렬해서 도는 것이 아니라 인접 목록을 만든 순서를 쓴다. 그 순서는 간선 정렬에서
        // 이미 결정됐고, 여기서 다시 정렬하면 같은 일을 두 번 하는 것이다.
        for (const neighbour of outgoing[index]) {
          if (layer[neighbour] !== -1) continue
          layer[neighbour] = depth
          next.push(neighbour)
        }
      }
      frontier = next
    }
  }

  walk(containers.map((_, index) => index).filter((index) => indegree[index] === 0))

  // 순환뿐이라 root 가 없었거나, root 에서 못 닿는 덩어리가 남았다.
  for (let index = 0; index < containers.length; index += 1) {
    if (layer[index] === -1) walk([index])
  }

  return layer
}

/**
 * layer 안에서 컨테이너를 어떤 순서로 놓을지.
 *
 * 바로 앞 layer 에 이미 놓인 선행 씬들의 **자리 평균**으로 정렬한다. 들어오는 선이 layer 를
 * 가로질러 되돌아가는 일이 줄어, 반복 없이 한 번에 대체로 안 꼬인 그림이 된다. 선행이 앞
 * layer 에 하나도 없는 컨테이너는 평균이 없으므로 열 끝에 모으고, 그 안에서는 입력 순서를
 * 지킨다.
 */
function orderLayer(
  members: readonly number[],
  previousOrder: readonly number[],
  predecessors: readonly number[][],
): number[] {
  const seat = new Map(previousOrder.map((index, position) => [index, position]))

  const barycenter = new Map<number, number>()
  for (const index of members) {
    const seats = predecessors[index]
      .map((parent) => seat.get(parent))
      .filter((position): position is number => position !== undefined)
    if (seats.length === 0) continue
    barycenter.set(index, seats.reduce((sum, position) => sum + position, 0) / seats.length)
  }

  return [...members].sort((left, right) => {
    const leftCentre = barycenter.get(left)
    const rightCentre = barycenter.get(right)
    if (leftCentre !== undefined && rightCentre !== undefined && leftCentre !== rightCentre) {
      return leftCentre - rightCentre
    }
    // 한쪽만 선행을 가지면 그쪽이 앞이다. 선행 없는 것들은 뒤에 모여 입력 순서를 지킨다.
    if (leftCentre !== undefined && rightCentre === undefined) return -1
    if (leftCentre === undefined && rightCentre !== undefined) return 1
    return left - right
  })
}

/** 상자 중심에서 `toward` 쪽으로 나가면서 테두리를 만나는 점. */
function exitPoint(
  centreX: number,
  centreY: number,
  halfWidth: number,
  halfHeight: number,
  towardX: number,
  towardY: number,
  clearance: number,
): { x: number; y: number } {
  const dx = towardX - centreX
  const dy = towardY - centreY
  const length = Math.hypot(dx, dy)
  // 두 상자가 정확히 겹쳐 놓이는 일은 이 배치에서 없지만, 호출자는 어떤 좌표든 넘길 수 있다.
  // 길이 0 짜리 방향 벡터는 아래 나눗셈을 전부 NaN 으로 만들어, 선이 아무 말 없이 DOM 에서
  // 사라진다.
  if (length === 0) return { x: centreX, y: centreY - halfHeight - clearance }

  const ux = dx / length
  const uy = dy / length
  // 두 축 중 먼저 만나는 테두리가 나가는 자리다. 방향이 축과 나란하면 그 축의 테두리는
  // 영영 만나지 않으므로 `Infinity` 로 두고 반대쪽이 이기게 한다.
  const toSide = ux === 0 ? Infinity : halfWidth / Math.abs(ux)
  const toCap = uy === 0 ? Infinity : halfHeight / Math.abs(uy)
  const distance = Math.min(toSide, toCap) + clearance
  return { x: centreX + ux * distance, y: centreY + uy * distance }
}

type Rect = { x: number; y: number; width: number; height: number }

function centreOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/**
 * 두 상자를 잇는 곡선.
 *
 * `offset` 이 0 이면 제어점이 두 중심을 잇는 직선 위에 앉아 시각적으로 곧은 선이 된다. 그래서
 * 부채꼴로 벌린 선과 혼자 있는 선이 같은 코드 한 벌로 그려진다.
 */
function link(from: Rect, to: Rect, offset: number): Drawn {
  const start = centreOf(from)
  const end = centreOf(to)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  const ux = length === 0 ? 1 : dx / length
  const uy = length === 0 ? 0 : dy / length

  const controlX = (start.x + end.x) / 2 - uy * offset
  const controlY = (start.y + end.y) / 2 + ux * offset

  const tail = exitPoint(start.x, start.y, from.width / 2, from.height / 2, controlX, controlY, 0)
  const head = exitPoint(end.x, end.y, to.width / 2, to.height / 2, controlX, controlY, ARROW_CLEARANCE)

  return {
    path: `M ${round(tail.x)} ${round(tail.y)} Q ${round(controlX)} ${round(controlY)} ${round(head.x)} ${round(head.y)}`,
    // 이차 베지에의 t = 0.5.
    midX: round(0.25 * tail.x + 0.5 * controlX + 0.25 * head.x),
    midY: round(0.25 * tail.y + 0.5 * controlY + 0.25 * head.y),
    loop: false,
  }
}

/** 층을 건너는 씬 전이가 도는 통로 사이 간격, 그리고 가장 안쪽 통로가 상자들에서 떨어지는 거리. */
const CHANNEL_STEP = 14
const CHANNEL_CLEARANCE = 30
/** 통로로 꺾이는 모서리의 둥근 반지름. */
const CORNER = 10
/** 틈 안에서 통로 선끼리 벌어지는 가로 거리. */
const LANE_STEP = 7
/** 옆면 위아래 끝에서 선이 닿지 않는 거리. */
const PORT_MARGIN = 10

/** 열(layer) 하나가 차지하는 가로 범위. */
type ColumnSpan = { left: number; right: number }

/**
 * 옆 열로 가는 씬 전이(ARTEL-1172). 상자 옆면에서 가로로 나가 가로로 들어오는 S 곡선이다 — 중심끼리 잇던 곧은
 * 선은 상자 모서리 아무 데서나 나가 화살촉이 한 점에 몰렸다. 나가고 들어오는 높이는 `assignPorts` 가 정한다.
 */
function sideLink(from: Rect, to: Rect, startY: number, endY: number): Drawn {
  const forward = to.x > from.x
  const start = { x: forward ? from.x + from.width : from.x, y: startY }
  const end = { x: forward ? to.x - ARROW_CLEARANCE : to.x + to.width + ARROW_CLEARANCE, y: endY }
  const pull = Math.abs(end.x - start.x) / 2
  const c1 = { x: start.x + (forward ? pull : -pull), y: start.y }
  const c2 = { x: end.x + (forward ? -pull : pull), y: end.y }
  return {
    path: `M ${round(start.x)} ${round(start.y)} C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`,
    // 삼차 베지에의 t = 0.5.
    midX: round((start.x + 3 * c1.x + 3 * c2.x + end.x) / 8),
    midY: round((start.y + 3 * c1.y + 3 * c2.y + end.y) / 8),
    loop: false,
  }
}

/**
 * 열을 둘 이상 건너는 씬 전이(ARTEL-1172). 가운데 열의 상자를 뚫지 않게, 출발 열 옆 틈으로 나가 그림 위(또는 아래)
 * 통로를 지나 도착 열 옆 틈으로 내려온다. 통로 높이와 틈 안의 세로 차선 [lane] 은 선마다 달라 겹쳐 달리지 않는다.
 */
function channelLink(
  from: Rect,
  to: Rect,
  startY: number,
  endY: number,
  fromColumn: ColumnSpan,
  toColumn: ColumnSpan,
  channelY: number,
  lane: number,
): Drawn {
  const forward = to.x > from.x
  const sign = forward ? 1 : -1
  const startX = forward ? from.x + from.width : from.x
  const endX = forward ? to.x - ARROW_CLEARANCE : to.x + to.width + ARROW_CLEARANCE
  const shift = Math.min(LAYER_GAP / 2 - CORNER * 2, lane * LANE_STEP)
  // 출발 틈에서는 바깥 통로일수록 상자에서 멀리, 도착 틈에서는 가까이 — 두 틈에서 차선이 서로 엇갈리지 않는다.
  const outX = (forward ? fromColumn.right + LAYER_GAP / 2 : fromColumn.left - LAYER_GAP / 2) + sign * shift
  const inX = (forward ? toColumn.left - LAYER_GAP / 2 : toColumn.right + LAYER_GAP / 2) - sign * shift
  const up = channelY < startY ? -1 : 1
  const r = CORNER
  const path = [
    `M ${round(startX)} ${round(startY)}`,
    `H ${round(outX - sign * r)}`,
    `Q ${round(outX)} ${round(startY)} ${round(outX)} ${round(startY + up * r)}`,
    `V ${round(channelY - up * r)}`,
    `Q ${round(outX)} ${round(channelY)} ${round(outX + sign * r)} ${round(channelY)}`,
    `H ${round(inX - sign * r)}`,
    `Q ${round(inX)} ${round(channelY)} ${round(inX)} ${round(channelY - up * r)}`,
    `V ${round(endY + up * r)}`,
    `Q ${round(inX)} ${round(endY)} ${round(inX + sign * r)} ${round(endY)}`,
    `H ${round(endX)}`,
  ].join(' ')
  return { path, midX: round((outX + inX) / 2), midY: round(channelY), loop: false }
}

/**
 * 상자 옆면마다 선이 닿는 높이(ARTEL-1172). 한 옆면에 닿는 선들을 상대 끝의 높이 순으로 세워 옆면 위에 고르게
 * 나눈다 — 전부 가운데 한 점에 꽂으면 화살촉이 겹쳐 몇 개가 들어오는지 셀 수 없었다. 같은 높이면 전이 id 순.
 */
function assignPorts(
  requests: readonly { key: string; edgeId: string; rect: Rect; toward: number }[],
): Map<string, number> {
  const bySide = new Map<string, { edgeId: string; rect: Rect; toward: number }[]>()
  for (const request of requests) {
    const list = bySide.get(request.key) ?? []
    list.push(request)
    bySide.set(request.key, list)
  }
  const ports = new Map<string, number>()
  for (const [key, list] of bySide) {
    list.sort((left, right) => left.toward - right.toward || left.edgeId.localeCompare(right.edgeId))
    const { rect } = list[0]
    const topY = rect.y + PORT_MARGIN
    const span = Math.max(0, rect.height - PORT_MARGIN * 2)
    list.forEach((entry, index) => {
      ports.set(`${key} ${entry.edgeId}`, topY + (span * (index + 1)) / (list.length + 1))
    })
  }
  return ports
}

/**
 * 상자 위쪽에 매달리는 고리. 오른쪽은 이제 다음 layer 로 나가는 선이 지나는 자리라 고리를
 * 위쪽으로 올린다. 같은 상자의 고리가 늘 때마다 바깥으로 자란다.
 */
function selfLink(rect: Rect, index: number): Drawn {
  const radius = SELF_LOOP_RADIUS + index * 9
  const centreX = rect.x + rect.width / 2
  // `spread` 를 반지름에 묶는다. 컨테이너가 가로로 넓어 폭의 18% 를 그대로 쓰면 두 끝
  // 사이 거리가 지름보다 커져 SVG 가 반지름을 제멋대로 늘린다.
  const spread = Math.min(rect.width * 0.18, radius * 0.8)

  return {
    path: `M ${round(centreX - spread)} ${round(rect.y)} A ${radius} ${radius} 0 1 1 ${round(centreX + spread)} ${round(rect.y)}`,
    midX: round(centreX),
    midY: round(rect.y - radius * 1.7),
    loop: true,
  }
}

/**
 * 같은 두 끝을 잇는 선들을 한 묶음으로.
 *
 * **순서 없는 쌍**으로 묶는다. `A → B` 와 `B → A` 를 다른 묶음으로 두면 둘이 정확히 같은
 * 곡선 위에 겹쳐 그려져, 서로 반대 방향인 두 전이가 하나로 보인다.
 */
function groupByPair<T extends { from: string; to: string }>(items: readonly T[]): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  items.forEach((item, index) => {
    const key =
      item.from === item.to
        ? `self ${item.from}`
        : `pair ${[item.from, item.to].sort().join(' ')}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [index])
    else group.push(index)
  })
  return groups
}

/** 부채꼴에서 이 선이 앉는 자리. 하나면 곧고, 둘이면 양쪽으로, 셋이면 가운데가 곧다. */
function fanOffset(position: number, size: number): number {
  return (position - (size - 1) / 2) * CURVE_STEP
}

/**
 * 부채꼴을 그리는 방향을 한쪽으로 고정하는 부호.
 *
 * 벌어지는 방향은 그려지는 방향의 수직이라, 선이 반대로 달리면 함께 뒤집힌다. 고정하지 않으면
 * `A → B` 의 −1 과 `B → A` 의 +1 이 같은 곡선으로 풀려, 부채꼴이 막으려던 겹침이 그대로
 * 돌아온다.
 */
function orientation(from: string, to: string): number {
  return from > to ? -1 : 1
}

/** 모델을 좌표로. 같은 모델은 언제나 같은 그림이 된다. */
export function layoutScreenMap(model: ScreenMapModel): ScreenMapLayout {
  const boxes = model.containers.map((container) => measureContainer(container.screens))
  const layer = assignLayers(model.containers, model.sceneEdges)

  const indexById = new Map(model.containers.map((container, index) => [container.id, index]))
  const predecessors: number[][] = model.containers.map(() => [])
  for (const { edge } of model.sceneEdges) {
    const from = indexById.get(edge.from)
    const to = indexById.get(edge.to)
    if (from === undefined || to === undefined || from === to) continue
    if (!predecessors[to].includes(from)) predecessors[to].push(from)
  }

  const layerCount = model.containers.length === 0 ? 0 : Math.max(...layer) + 1
  const byLayer: number[][] = Array.from({ length: layerCount }, () => [])
  model.containers.forEach((_, index) => byLayer[layer[index]].push(index))

  const placed: PlacedContainer[] = new Array(model.containers.length)
  let previousOrder: number[] = []
  let left = 0

  for (let depth = 0; depth < layerCount; depth += 1) {
    const order = depth === 0 ? byLayer[0] : orderLayer(byLayer[depth], previousOrder, predecessors)
    const totalHeight =
      order.reduce((sum, index) => sum + boxes[index].height, 0) + SIBLING_GAP * (order.length - 1)
    const columnWidth = order.reduce((max, index) => Math.max(max, boxes[index].width), 0)

    // 열을 y = 0 을 기준으로 가운데 정렬한다. 위 맞춤이면 씬 하나짜리 열이 위쪽 끝에
    // 붙어, 좌우 열을 잇는 선이 전부 한쪽으로 쏠린다.
    let top = -totalHeight / 2
    for (const index of order) {
      const container = model.containers[index]
      const box = boxes[index]
      // 열 안에서 가로 가운데. 왼쪽 맞춤이면 화면 스무 개짜리 씬 하나가 열 폭을 혼자 정하고
      // 이웃들이 그 왼쪽 모서리에 매달린다 — 씬마다 화면 수가 크게 다른 것은 정상이므로
      // (한 씬에서만 오버레이가 여럿 갈린다) 그 경우가 사고처럼 보이면 안 된다.
      const offset = (columnWidth - box.width) / 2
      placed[index] = {
        id: container.id,
        node: container.node,
        x: round(left + offset),
        y: round(top),
        width: box.width,
        height: box.height,
        layer: depth,
        screens: container.screens.map((screen, position) => ({
          screen,
          x: round(left + offset + box.screens[position].x),
          y: round(top + box.screens[position].y),
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
        })),
      }
      top += box.height + SIBLING_GAP
    }

    previousOrder = order
    left += columnWidth + LAYER_GAP
  }

  const rectById = new Map(placed.map((container) => [container.id, container]))
  const screenRects = new Map<string, PlacedScreen>()
  const containerOfScreen = new Map<string, string>()
  for (const container of placed) {
    for (const screen of container.screens) {
      screenRects.set(screen.screen.id, screen)
      containerOfScreen.set(screen.screen.id, container.id)
    }
  }

  // 열마다 가로 범위와 그림 전체의 위아래 끝. 층을 건너는 선이 도는 틈과 통로가 여기서 나온다.
  const columns: ColumnSpan[] = Array.from({ length: layerCount }, () => ({ left: Infinity, right: -Infinity }))
  let top = 0
  let bottom = 0
  for (const container of placed) {
    const column = columns[container.layer]
    column.left = Math.min(column.left, container.x)
    column.right = Math.max(column.right, container.x + container.width)
    top = Math.min(top, container.y)
    bottom = Math.max(bottom, container.y + container.height)
  }
  // 통로 번호는 전이 id 순으로 준다. 입력 순서로 주면 같은 지도가 응답 순서에 따라 다르게 그려진다.
  const longEdges = model.sceneEdges
    .filter(({ edge }) => {
      const from = rectById.get(edge.from)
      const to = rectById.get(edge.to)
      return from !== undefined && to !== undefined && Math.abs(from.layer - to.layer) > 1
    })
    .map(({ id, edge }) => ({ id, edge }))
    .sort((left, right) => left.id.localeCompare(right.id))
  let above = 0
  let below = 0
  const channelOf = new Map<string, { y: number; lane: number }>()
  for (const { id, edge } of longEdges) {
    const from = rectById.get(edge.from)
    const to = rectById.get(edge.to)
    if (from === undefined || to === undefined) continue
    // 두 끝의 가운데가 위쪽이면 위 통로, 아래쪽이면 아래 통로 — 열은 y = 0 을 가운데로 놓였다.
    const middle = (from.y + from.height / 2 + to.y + to.height / 2) / 2
    if (middle <= 0) {
      channelOf.set(id, { y: top - CHANNEL_CLEARANCE - CHANNEL_STEP * above, lane: above })
      above += 1
    } else {
      channelOf.set(id, { y: bottom + CHANNEL_CLEARANCE + CHANNEL_STEP * below, lane: below })
      below += 1
    }
  }

  // 옆 열 · 통로 선이 상자 옆면에 닿는 높이.
  const portRequests: { key: string; edgeId: string; rect: Rect; toward: number }[] = []
  for (const { id, edge } of model.sceneEdges) {
    const from = rectById.get(edge.from)
    const to = rectById.get(edge.to)
    if (from === undefined || to === undefined || edge.from === edge.to || from.layer === to.layer) continue
    const forward = to.x > from.x
    const channel = channelOf.get(id)
    const fromToward = channel?.y ?? to.y + to.height / 2
    const toToward = channel?.y ?? from.y + from.height / 2
    portRequests.push({ key: `${edge.from} ${forward ? 'R' : 'L'}`, edgeId: id, rect: from, toward: fromToward })
    portRequests.push({ key: `${edge.to} ${forward ? 'L' : 'R'}`, edgeId: id, rect: to, toward: toToward })
  }
  const ports = assignPorts(portRequests)

  const sceneEdges: PlacedSceneEdge[] = []
  const edgeEnds = model.sceneEdges.map(({ edge }) => ({ from: edge.from, to: edge.to }))
  for (const group of groupByPair(edgeEnds).values()) {
    group.forEach((index, position) => {
      const { id, edge } = model.sceneEdges[index]
      const from = rectById.get(edge.from)
      const to = rectById.get(edge.to)
      if (from === undefined || to === undefined) return

      let drawn: Drawn
      if (edge.from === edge.to) drawn = selfLink(from, position)
      else if (from.layer === to.layer) {
        drawn = link(from, to, fanOffset(position, group.length) * orientation(edge.from, edge.to))
      } else {
        const forward = to.x > from.x
        const startY = ports.get(`${edge.from} ${forward ? 'R' : 'L'} ${id}`) ?? from.y + from.height / 2
        const endY = ports.get(`${edge.to} ${forward ? 'L' : 'R'} ${id}`) ?? to.y + to.height / 2
        const channel = channelOf.get(id)
        drawn =
          channel === undefined
            ? sideLink(from, to, startY, endY)
            : channelLink(from, to, startY, endY, columns[from.layer], columns[to.layer], channel.y, channel.lane)
      }
      sceneEdges.push({ id, edge, ...drawn })
    })
  }

  const screenTransitions: PlacedScreenTransition[] = []
  const transitionEnds = model.screenTransitions.map(({ transition }) => ({
    from: transition.fromScreenId,
    to: transition.toScreenId,
  }))
  for (const group of groupByPair(transitionEnds).values()) {
    group.forEach((index, position) => {
      const { id, transition } = model.screenTransitions[index]
      const from = screenRects.get(transition.fromScreenId)
      const to = screenRects.get(transition.toScreenId)
      if (from === undefined || to === undefined) return

      const drawn =
        transition.fromScreenId === transition.toScreenId
          ? selfLink(from, position)
          : link(
              from,
              to,
              fanOffset(position, group.length) *
                orientation(transition.fromScreenId, transition.toScreenId),
            )
      screenTransitions.push({
        id,
        transition,
        crossesContainer:
          containerOfScreen.get(transition.fromScreenId) !==
          containerOfScreen.get(transition.toScreenId),
        ...drawn,
      })
    })
  }

  return {
    ...frame(placed, [...sceneEdges, ...screenTransitions]),
    containers: placed,
    sceneEdges,
    screenTransitions,
    layerCount,
  }
}

/**
 * 뷰 박스.
 *
 * 고리와 부채꼴로 벌어진 곡선은 컨테이너 바깥으로 나간다. 여백을 고정값 하나로 두면 그림
 * 가장자리에 붙은 씬의 고리가 반쯤 잘려, 자기 자신으로 가는 전이가 있다는 사실이 사라진다.
 * 그래서 선의 중점까지 함께 재고 나서 여백을 두른다.
 */
function frame(
  containers: readonly PlacedContainer[],
  links: readonly Drawn[],
): { viewBox: string; width: number; height: number } {
  if (containers.length === 0) return { viewBox: '0 0 100 100', width: 100, height: 100 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const container of containers) {
    minX = Math.min(minX, container.x)
    minY = Math.min(minY, container.y)
    maxX = Math.max(maxX, container.x + container.width)
    maxY = Math.max(maxY, container.y + container.height)
  }
  for (const drawn of links) {
    minX = Math.min(minX, drawn.midX)
    minY = Math.min(minY, drawn.midY)
    maxX = Math.max(maxX, drawn.midX)
    maxY = Math.max(maxY, drawn.midY)
  }

  return {
    viewBox: `${round(minX - PADDING)} ${round(minY - PADDING)} ${round(maxX - minX + PADDING * 2)} ${round(maxY - minY + PADDING * 2)}`,
    width: round(maxX - minX + PADDING * 2),
    height: round(maxY - minY + PADDING * 2),
  }
}
