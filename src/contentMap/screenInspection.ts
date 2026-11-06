import type { KnowledgeNode } from '../knowledge/knowledgeTypes'
import type {
  ContentMapScene,
  ContentMapScreen,
  SceneCapability,
  ScreenTransition,
} from './contentMapTypes'
import { readDiscriminator, type ScreenDiscriminator } from './screenDiscriminator'
import type {
  SceneContainerModel,
  SceneEdgeModel,
  ScreenMapModel,
  ScreenTransitionModel,
} from './screenMapLayout'

/*
 * 인스펙터가 그릴 것을 응답에서 뽑는 일. React 도 DOM 도 없는 순수 함수만 있다.
 *
 * ## 왜 색인을 미리 만드는가
 *
 * 화면 하나를 고를 때마다 화면 30 개와 전이 39 개를 다시 훑으면, 고르는 동작 하나가 응답 전체를
 * 도는 비용을 낸다. 배치(`screenMapLayout`)와 같은 이유로 색인도 응답 말고는 아무것에도 기대지
 * 않는다 — 무언가를 고르는 것이 색인을 다시 만들게 두면 클릭 한 번마다 전체가 다시 돈다.
 *
 * ## 왜 `ScreenMapModel` 을 받는가
 *
 * 응답이 아니라 모델을 받는다. 캔버스가 쓰는 선택 id 가 모델에서 나오기 때문이다
 * (`sceneEdge:...`, `screenTransition:...`). 응답에서 목록을 다시 만들면 두 곳이 같은 것에 다른
 * id 를 붙이게 되고, 그러면 목록에서 고른 것이 그림에서 안 밝혀진다 — 그림과 목록이 같은 것을
 * 고를 수 있어야 한다는 것이 이 패널의 존재 이유인데 말이다.
 *
 * ## 세 가지를 유도한다
 *
 * 서버가 말하지 않는 것이 셋 있고, 그때마다 화면 문구가 유도했다는 것을 그대로 말한다.
 *
 * | 원하는 것 | 서버가 주는 것 | 여기서 하는 일 |
 * |---|---|---|
 * | 화면에 묶인 capability | `screen_capability` 는 조회에 없다 | 나가는 전이가 쓴 capability 를 모은다 |
 * | screen transition 의 확인 여부 | 그런 칸이 없다 | 그 전이를 일으킨 capability 의 `verification` 을 쓴다 |
 * | 화면에 묶인 지식 | content-map 응답에 없다 | 지식 그래프의 anchor 를 화면 id 로 고른다 |
 */

/** 한 번 훑어 만드는 색인. 화면을 고를 때마다 다시 만들지 않는다. */
export type ScreenMapIndex = {
  containerById: ReadonlyMap<string, SceneContainerModel>
  /** 화면 id → 그 화면이 든 컨테이너. 전이가 화면 id 로만 오므로 되짚을 자리가 필요하다. */
  containerOfScreen: ReadonlyMap<string, SceneContainerModel>
  screenById: ReadonlyMap<string, ContentMapScreen>
  /**
   * capability id → 그 행.
   *
   * 씬을 가리지 않고 하나로 모은다. 전이가 씬 경계를 넘으면 그 전이의 capability 는 출발 화면이
   * 속한 씬이 아닌 씬에 앉아 있을 수 있고, 씬별로 나눠 두면 그때 배지가 조용히 사라진다.
   */
  capabilityById: ReadonlyMap<string, SceneCapability>
  outgoing: ReadonlyMap<string, ScreenTransitionModel[]>
  incoming: ReadonlyMap<string, ScreenTransitionModel[]>
  sceneEdgesFrom: ReadonlyMap<string, SceneEdgeModel[]>
  sceneEdgesTo: ReadonlyMap<string, SceneEdgeModel[]>
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key)
  if (existing === undefined) map.set(key, [value])
  else existing.push(value)
}

export function indexScreenMap(model: ScreenMapModel): ScreenMapIndex {
  const containerById = new Map<string, SceneContainerModel>()
  const containerOfScreen = new Map<string, SceneContainerModel>()
  const screenById = new Map<string, ContentMapScreen>()
  const capabilityById = new Map<string, SceneCapability>()

  for (const container of model.containers) {
    containerById.set(container.id, container)
    for (const screen of container.screens) {
      containerOfScreen.set(screen.id, container)
      screenById.set(screen.id, screen)
    }
    for (const capability of container.node.scene?.capabilityList ?? []) {
      // 먼저 온 것이 이긴다. 파서가 씬 안에서 이미 접었으므로 여기 겹침은 서버가 같은 id 를 두
      // 씬에 앉힌 경우뿐이고, 그때 어느 쪽을 고르든 배지는 같다.
      if (!capabilityById.has(capability.id)) capabilityById.set(capability.id, capability)
    }
  }

  const outgoing = new Map<string, ScreenTransitionModel[]>()
  const incoming = new Map<string, ScreenTransitionModel[]>()
  for (const placed of model.screenTransitions) {
    push(outgoing, placed.transition.fromScreenId, placed)
    push(incoming, placed.transition.toScreenId, placed)
  }

  const sceneEdgesFrom = new Map<string, SceneEdgeModel[]>()
  const sceneEdgesTo = new Map<string, SceneEdgeModel[]>()
  for (const placed of model.sceneEdges) {
    push(sceneEdgesFrom, placed.edge.from, placed)
    push(sceneEdgesTo, placed.edge.to, placed)
  }

  return {
    containerById,
    containerOfScreen,
    screenById,
    capabilityById,
    outgoing,
    incoming,
    sceneEdgesFrom,
    sceneEdgesTo,
  }
}

/** 전이 하나와, 그 끝에 있는 것들. */
export type ScreenTransitionDetail = {
  /** 캔버스와 같은 선택 id. */
  id: string
  transition: ScreenTransition
  /** 목적지 화면. 파서가 두 끝이 모두 실제 화면인 전이만 남기므로 사실상 늘 있다. */
  to: ContentMapScreen | null
  toScene: ContentMapScene | null
  /**
   * 이 전이를 일으킨 capability.
   *
   * `transition.capabilityId` 가 null 이면 자동 전이라 애초에 없다. id 는 있는데 여기가 null 이면
   * 그 capability 가 재적재로 지워진 것이고, 두 사실은 화면에서 다른 문장이 된다.
   */
  capability: SceneCapability | null
}

/**
 * 이 화면에서 할 수 있는 일 하나.
 *
 * **이 화면이 속한 씬의 capability 다.** 화면이 어떤 capability 를 제공했는지는 `screen_capability`
 * 표에만 있고 조회 응답에는 없다. 그래서 씬의 목록을 쓰되, 이 화면에서 나가는 전이가 실제로 쓴
 * 것을 [transitionCount] 로 표시해 앞에 세운다 — 유도한 부분과 관측된 부분이 한 줄 안에서 갈린다.
 *
 * `not-a-step` 은 오지 않는다. 조작이 없어 단독으로 지시할 수 없는 행이고, 실측 빌드에서 씬 하나의
 * capability 232 개 중 224 개가 거기다. 그것을 이 목록에 넣으면 "여기서 무엇을 할 수 있나"의 답이
 * 스물여덟 배로 늘어난다.
 *
 * `capability` 가 null 이면 씬 목록에서 찾지 못한 것이다 — 씬 경계를 넘는 전이의 capability 가
 * 재적재로 지워진 경우다. 그때도 줄을 지우지 않는다: 전이가 요약을 들고 오므로 "무엇을 해서
 * 나갔는지"는 여전히 말할 수 있고, 배지만 붙지 않는다.
 */
export type ScreenCapabilityUse = {
  id: string
  capability: SceneCapability | null
  summary: string
  /** 이 화면에서 나가는 전이 중 이것을 쓴 것의 수. 0 이면 아직 쓰인 것이 관측되지 않았다. */
  transitionCount: number
}

export type ScreenEvidence = {
  screen: ContentMapScreen
  /** 이 화면이 든 씬. 컨테이너가 자리표시면 `scene` 은 null 이다. */
  container: SceneContainerModel | null
  scene: ContentMapScene | null
  discriminator: ScreenDiscriminator
  capabilities: ScreenCapabilityUse[]
  /** 목록에서 빠진 `not-a-step` capability 수. 0 이 아니면 화면이 그 사실을 한 줄로 말한다. */
  notAStepCount: number
  outgoing: ScreenTransitionDetail[]
  /** 들어오는 전이 수. 목록까지 그리지는 않는다 — 이 패널이 답하는 질문은 "여기서 어디로 가나"다. */
  incomingCount: number
}

/** 단독으로 지시할 수 없는 행. 이 목록에 넣으면 답이 스물여덟 배로 늘어난다. */
const NOT_A_STEP = 'not-a-step'

/**
 * 고른 화면의 근거 전부.
 *
 * capability 목록은 씬의 것에서 출발해, 이 화면에서 나가는 전이가 쓴 것을 세어 앞으로 당긴다.
 * 정렬은 쓰인 횟수 하나로만 하고 나머지는 원래 순서를 지킨다 — JS 정렬이 안정적이라, 같은 응답은
 * 언제나 같은 목록이 되고 그림의 순서와도 어긋나지 않는다.
 */
export function readScreenEvidence(index: ScreenMapIndex, screenId: string): ScreenEvidence | null {
  const screen = index.screenById.get(screenId)
  if (screen === undefined) return null

  const container = index.containerOfScreen.get(screenId) ?? null
  const scene = container?.node.scene ?? null

  const uses = new Map<string, ScreenCapabilityUse>()
  let notAStepCount = 0
  for (const capability of scene?.capabilityList ?? []) {
    if (capability.status === NOT_A_STEP) {
      notAStepCount += 1
      continue
    }
    uses.set(capability.id, {
      id: capability.id,
      capability,
      summary: capability.summary,
      transitionCount: 0,
    })
  }

  const outgoing: ScreenTransitionDetail[] = []
  for (const placed of index.outgoing.get(screenId) ?? []) {
    const { transition } = placed
    const capability =
      transition.capabilityId === null
        ? null
        : (index.capabilityById.get(transition.capabilityId) ?? null)

    outgoing.push({
      id: placed.id,
      transition,
      to: index.screenById.get(transition.toScreenId) ?? null,
      toScene: index.containerOfScreen.get(transition.toScreenId)?.node.scene ?? null,
      capability,
    })

    if (transition.capabilityId === null) continue
    const existing = uses.get(transition.capabilityId)
    if (existing !== undefined) {
      existing.transitionCount += 1
      continue
    }
    // 씬 목록에 없는 capability 다 — 경계를 넘는 전이이거나, 그 행이 재적재로 지워진 것이다.
    // 관측된 사실이므로 목록에서 빼지 않는다.
    uses.set(transition.capabilityId, {
      id: transition.capabilityId,
      capability,
      // capability 행의 요약을 먼저 쓴다. 전이 쪽 요약은 그 행에서 복사된 값이라 같은 글이고,
      // 행이 지워졌을 때만 전이 쪽이 남아 있다.
      summary: capability?.summary ?? transition.capabilitySummary ?? '',
      transitionCount: 1,
    })
  }

  return {
    screen,
    container,
    scene,
    discriminator: readDiscriminator(screen.discriminator),
    capabilities: [...uses.values()].sort(
      (left, right) => right.transitionCount - left.transitionCount,
    ),
    notAStepCount,
    outgoing,
    incomingCount: (index.incoming.get(screenId) ?? []).length,
  }
}

export type SceneEvidence = {
  container: SceneContainerModel
  scene: ContentMapScene | null
  screens: ContentMapScreen[]
  /** 이 씬에서 나가는 전이. 확인 여부는 `edge.transition.verifiedAt` 이 말한다. */
  outgoing: SceneEdgeModel[]
  /**
   * 이 씬으로 들어오는 전이. 자기 자신으로 가는 전이는 빠진다 — 나가는 목록에 이미 있고,
   * 두 목록에 다 넣으면 전이 하나가 둘로 읽힌다.
   */
  incoming: SceneEdgeModel[]
  /** 이 씬 안 화면들에서 나가는 screen transition 수. */
  screenTransitionCount: number
}

export function readSceneEvidence(index: ScreenMapIndex, containerId: string): SceneEvidence | null {
  const container = index.containerById.get(containerId)
  if (container === undefined) return null

  let screenTransitionCount = 0
  for (const screen of container.screens) {
    screenTransitionCount += (index.outgoing.get(screen.id) ?? []).length
  }

  return {
    container,
    scene: container.node.scene,
    screens: container.screens,
    outgoing: index.sceneEdgesFrom.get(containerId) ?? [],
    incoming: (index.sceneEdgesTo.get(containerId) ?? []).filter(
      (placed) => placed.edge.from !== placed.edge.to,
    ),
    screenTransitionCount,
  }
}

/**
 * 이 화면에 묶인 지식.
 *
 * anchor 는 `(sceneName, screenId)` 짝이고 `screenId` 가 null 인 것이 보통이다 — 화면은 관측으로
 * 정해지고 대개 정해지지 않는다. 씬 이름으로도 맞춰 보고 싶어지지만 그러지 않는다: 씬에 묶인
 * 지식을 화면에 묶인 것처럼 그리면, 그 씬의 화면 스물아홉 개가 전부 같은 지식을 달고 서서 무엇이
 * 이 화면의 사실인지 말할 수 없게 된다.
 */
export function anchoredToScreen(
  nodes: readonly KnowledgeNode[],
  screenId: string,
): KnowledgeNode[] {
  return nodes.filter((node) => node.anchors.some((anchor) => anchor.screenId === screenId))
}
